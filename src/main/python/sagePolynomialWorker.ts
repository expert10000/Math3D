import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const SAGE_POLYNOMIAL_SCRIPT = String.raw`
import json
import sys
from sage.all import ComplexIntervalField, PolynomialRing, QQ, QQbar, ZZ, latex

request = json.load(sys.stdin)
coefficients = request["parameters"]["coefficients"]
ring = PolynomialRing(QQ, "x")
polynomial = ring([ZZ(value) for value in coefficients])
operation = request["operation"]
if operation == "symbolic.factor":
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
    result = {
        "inputCoefficients": coefficients,
        "unit": str(factorization.unit()),
        "factors": factors,
        "degree": int(polynomial.degree()),
        "verified": True,
        "text": str(factorization),
        "latex": str(latex(factorization)),
    }
    diagnostics = ["Exact factor product verified in QQ[x]"]
elif operation == "polynomial.roots_exact":
    roots = polynomial.roots(ring=QQbar)
    precision_bits = 128
    while True:
        intervals = [root.interval(ComplexIntervalField(precision_bits)) for root, _ in roots]
        if all(not intervals[i].overlaps(intervals[j]) for i in range(len(intervals)) for j in range(i + 1, len(intervals))):
            break
        precision_bits *= 2
        if precision_bits > 1024:
            raise RuntimeError("Could not isolate all algebraic roots within the precision limit")
    algebraic_ring = PolynomialRing(QQbar, "x")
    x = algebraic_ring.gen()
    reconstructed = algebraic_ring(polynomial.leading_coefficient())
    entries = []
    for (root, multiplicity), interval in zip(roots, intervals):
        if polynomial(root) != 0:
            raise RuntimeError("An algebraic root did not satisfy the input polynomial")
        reconstructed *= (x - root) ** multiplicity
        entries.append({
            "minimalPolynomialCoefficients": [str(value) for value in root.minpoly().list()],
            "isolatingInterval": str(interval),
            "approximation": str(root),
            "multiplicity": int(multiplicity),
        })
    if sum(entry["multiplicity"] for entry in entries) != polynomial.degree() or reconstructed != algebraic_ring(polynomial):
        raise RuntimeError("Algebraic roots did not reconstruct the input polynomial")
    result = {
        "inputCoefficients": coefficients,
        "leadingCoefficient": str(polynomial.leading_coefficient()),
        "degree": int(polynomial.degree()),
        "rootCount": sum(entry["multiplicity"] for entry in entries),
        "isolationPrecisionBits": precision_bits,
        "roots": entries,
        "verified": True,
        "text": "; ".join(entry["approximation"] + " (multiplicity " + str(entry["multiplicity"]) + ")" for entry in entries),
        "latex": str(latex([root for root, _ in roots])),
    }
    diagnostics = ["All roots verified exactly in QQbar; multiplicities reconstruct the input polynomial"]
else:
    raise ValueError("Unsupported polynomial operation")
print(json.dumps({
    "schemaVersion": 1,
    "jobId": request["jobId"],
    "operation": operation,
    "status": "succeeded",
    "result": result,
    "diagnostics": diagnostics,
}, separators=(",", ":")))
`;

type LocalPolynomialOperation = "sage.polynomial.factor" | "sage.polynomial.roots_exact";

type ActiveJob = {
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
};

const activeJobs = new Map<string, ActiveJob>();

export function cancelSagePolynomialJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.cancelled = true;
  job.child.kill();
  return true;
}

export async function runSagePolynomialJob(
  operation: LocalPolynomialOperation,
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
    throw new Error("A local Sage polynomial job is already running. Wait for it or cancel it first.");
  }

  const jobId = requestedJobId ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new Error("Invalid Sage job identifier.");
  }
  const contract = {
    schemaVersion: 1,
    jobId,
    operation: operation === "sage.polynomial.factor" ? "symbolic.factor" : "polynomial.roots_exact",
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
        "/usr/bin/sage", "-python", "-c", SAGE_POLYNOMIAL_SCRIPT,
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
      const taskName = operation === "sage.polynomial.factor" ? "factorization" : "root calculation";
      if (job.cancelled) return finish(new Error(`Sage ${taskName} cancelled.`));
      if (timedOut || code === 124) return finish(new Error(`Sage ${taskName} exceeded the 20-second limit.`));
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
          reply.operation !== contract.operation || reply.status !== "succeeded" ||
          !reply.result || reply.result.verified !== true
        ) {
          throw new Error("Sage worker returned an invalid polynomial contract.");
        }
        finish(undefined, {
          engine: "sagemath",
          operation,
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
