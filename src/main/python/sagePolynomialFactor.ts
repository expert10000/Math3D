import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const SAGE_FACTOR_SCRIPT = String.raw`
import json
import sys
from sage.all import PolynomialRing, QQ, ZZ, latex

request = json.load(sys.stdin)
coefficients = request["parameters"]["coefficients"]
ring = PolynomialRing(QQ, "x")
polynomial = ring([ZZ(value) for value in coefficients])
factorization = polynomial.factor()
reconstructed = ring(factorization.unit())
factors = []
for factor, multiplicity in factorization:
    reconstructed *= factor ** multiplicity
    factors.append({
        "coefficients": [str(value) for value in factor.list()],
        "multiplicity": int(multiplicity),
    })
if reconstructed != polynomial:
    raise RuntimeError("Exact factor product did not reconstruct the input")
print(json.dumps({
    "schemaVersion": 1,
    "jobId": request["jobId"],
    "operation": "symbolic.factor",
    "status": "succeeded",
    "result": {
        "inputCoefficients": coefficients,
        "unit": str(factorization.unit()),
        "factors": factors,
        "degree": int(polynomial.degree()),
        "verified": True,
        "text": str(factorization),
        "latex": str(latex(factorization)),
    },
    "diagnostics": ["Exact factor product verified in QQ[x]"],
}, separators=(",", ":")))
`;

type ActiveJob = {
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
};

const activeJobs = new Map<string, ActiveJob>();

export function cancelSagePolynomialFactor(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.cancelled = true;
  job.child.kill();
  return true;
}

export async function runSagePolynomialFactor(
  params: Record<string, unknown>,
  requestedJobId?: string,
): Promise<Record<string, unknown>> {
  const coefficients = params.coefficients;
  if (
    !Array.isArray(coefficients) ||
    coefficients.length < 2 ||
    coefficients.length > 13 ||
    !coefficients.every(
      (value) =>
        typeof value === "string" && /^-?(?:0|[1-9][0-9]{0,17})$/.test(value),
    ) ||
    /^-?0$/.test(coefficients[coefficients.length - 1])
  ) {
    throw new Error("Enter 2–13 integer coefficients in constant-first order, with a nonzero leading coefficient (up to 18 digits each).");
  }
  if (activeJobs.size > 0) {
    throw new Error("A local Sage factorization is already running. Wait for it or cancel it first.");
  }

  const jobId = requestedJobId ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new Error("Invalid Sage job identifier.");
  }
  const contract = {
    schemaVersion: 1,
    jobId,
    operation: "symbolic.factor",
    parameters: { coefficients },
  };
  const inputHash = createHash("sha256")
    .update(JSON.stringify(contract.parameters))
    .digest("hex");
  const started = Date.now();

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(
      "wsl.exe",
      [
        "-d", "Ubuntu", "--exec",
        "/usr/bin/timeout", "--kill-after=1s", "20s",
        "/usr/bin/prlimit", "--as=4294967296", "--cpu=18", "--",
        "/usr/bin/sage", "-python", "-c", SAGE_FACTOR_SCRIPT,
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    const job: ActiveJob = { child, cancelled: false };
    activeJobs.set(jobId, job);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 25_000);
    const finish = (error?: Error, result?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeJobs.delete(jobId);
      if (error) reject(error);
      else resolve(result ?? {});
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > 65_536) {
        child.kill();
        finish(new Error("Sage worker output exceeded 64 KiB."));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr) > 65_536) {
        child.kill();
        finish(new Error("Sage worker diagnostics exceeded 64 KiB."));
      }
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (job.cancelled) return finish(new Error("Sage factorization cancelled."));
      if (timedOut || code === 124) return finish(new Error("Sage factorization exceeded the 20-second limit."));
      if (code !== 0) return finish(new Error(`Sage worker exited with code ${code}: ${stderr.trim().slice(-2000)}`));
      try {
        const reply = JSON.parse(stdout.trim()) as {
          schemaVersion?: number;
          jobId?: string;
          operation?: string;
          status?: string;
          result?: Record<string, unknown>;
          diagnostics?: string[];
        };
        if (
          reply.schemaVersion !== 1 || reply.jobId !== jobId ||
          reply.operation !== "symbolic.factor" || reply.status !== "succeeded" ||
          !reply.result || reply.result.verified !== true
        ) {
          throw new Error("Sage worker returned an invalid factorization contract.");
        }
        finish(undefined, {
          engine: "sagemath",
          operation: "sage.polynomial.factor",
          success: true,
          latex: reply.result.latex,
          result: {
            ...reply.result,
            schemaVersion: 1,
            jobId,
            inputHash,
            diagnostics: reply.diagnostics ?? [],
          },
          warnings: [],
          elapsedMs: Date.now() - started,
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Invalid Sage worker JSON."));
      }
    });
    child.stdin.on("error", (error) => finish(error));
    child.stdin.end(JSON.stringify(contract));
  });
}
