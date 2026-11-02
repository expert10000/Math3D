import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { localSageDistro, resolveLocalSageExecutable } from "./localSageRuntime";

export const SAGE_CONSOLE_LIMITS = {
  maxInputBytes: 16 * 1024,
  maxOutputBytes: 64 * 1024,
  maxMemoryBytes: 4 * 1024 * 1024 * 1024,
  maxWorkUnits: 1,
  deadlineMs: 20_000,
} as const;

export type SageConsoleResponse = {
  jobId: string;
  success: boolean;
  backendId: "sage-local-wsl";
  engineVersion?: string;
  stdout: string;
  result: string;
  error?: string;
  warnings: string[];
  inputHash: string;
  elapsedMs: number;
};

const SCRIPT = String.raw`
import ast
import contextlib
import io
import json
import sys
import traceback
from sage.all import *
from sage.env import SAGE_VERSION
from sage.repl.preparse import preparse

request = json.load(sys.stdin)
output = io.StringIO()
result = ""
error = None
namespace = dict(globals(), __name__="__sage_console__")
try:
    source = preparse(request["code"])
    tree = ast.parse(source, mode="exec")
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
            ast.fix_missing_locations(tree)
            exec(compile(tree, "<sage-console>", "exec"), namespace)
            result = repr(eval(compile(last, "<sage-console>", "eval"), namespace))
        else:
            exec(compile(tree, "<sage-console>", "exec"), namespace)
except BaseException:
    error = traceback.format_exc(limit=6)
print(json.dumps({"jobId": request["jobId"], "success": error is None,
                  "engineVersion": str(SAGE_VERSION), "stdout": output.getvalue(),
                  "result": result, "error": error}, separators=(",", ":")))
`;

type Active = { child: ChildProcessWithoutNullStreams; cancelled: boolean };
const active = new Map<string, Active>();

export function cancelSageConsoleJob(jobId: string): boolean {
  const job = active.get(jobId);
  if (!job) return false;
  job.cancelled = true;
  job.child.kill();
  return true;
}

export async function runSageConsoleJob(jobId: string, code: string): Promise<SageConsoleResponse> {
  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid Sage console job ID.");
  if (typeof code !== "string" || !code.trim() || Buffer.byteLength(code, "utf8") > SAGE_CONSOLE_LIMITS.maxInputBytes) {
    throw new Error("Enter Sage code of at most 16 KiB.");
  }
  if (active.has(jobId)) throw new Error("Sage console job ID is already running.");
  if (active.size > 0) throw new Error("A Sage console job is already running.");
  const inputHash = createHash("sha256").update(code).digest("hex");
  const started = Date.now();
  const executable = await resolveLocalSageExecutable();
  if (active.size > 0) throw new Error("A Sage console job is already running.");
  return new Promise<SageConsoleResponse>((resolve, reject) => {
    const child = spawn("wsl.exe", ["-d", localSageDistro(), "--exec", "/usr/bin/timeout", "--kill-after=1s", "20s",
      "/usr/bin/prlimit", "--as=4294967296", "--cpu=18", "--", executable, "-c", SCRIPT],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const job: Active = { child, cancelled: false };
    active.set(jobId, job);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 25_000);
    const finish = (error?: Error, response?: SageConsoleResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active.delete(jobId);
      if (error) reject(error); else resolve(response!);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > SAGE_CONSOLE_LIMITS.maxOutputBytes) {
        child.kill(); finish(new Error("Sage console output exceeded 64 KiB."));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr) > SAGE_CONSOLE_LIMITS.maxOutputBytes) {
        child.kill(); finish(new Error("Sage console diagnostics exceeded 64 KiB."));
      }
    });
    child.once("error", (error) => finish(error));
    child.once("close", (exitCode) => {
      if (job.cancelled) return finish(new Error("Sage console job cancelled."));
      if (timedOut || exitCode === 124) return finish(new Error("Sage console exceeded the 20-second limit."));
      if (exitCode !== 0) return finish(new Error(stderr.trim().slice(0, 1024) || `Sage console exited with code ${exitCode}.`));
      try {
        const data = JSON.parse(stdout.trim()) as Partial<SageConsoleResponse>;
        if (data.jobId !== jobId || typeof data.success !== "boolean" || typeof data.stdout !== "string" ||
          typeof data.result !== "string" || typeof data.engineVersion !== "string") throw new Error("Invalid Sage console response.");
        finish(undefined, { jobId, success: data.success, backendId: "sage-local-wsl", engineVersion: data.engineVersion,
          stdout: data.stdout, result: data.result, error: typeof data.error === "string" ? data.error : undefined,
          warnings: ["Trusted code runs with your user account in WSL; limits are best effort."],
          inputHash, elapsedMs: Date.now() - started });
      } catch (error) { finish(error instanceof Error ? error : new Error("Invalid Sage console response.")); }
    });
    child.stdin.on("error", (error) => finish(error));
    child.stdin.end(JSON.stringify({ jobId, code }));
  });
}
