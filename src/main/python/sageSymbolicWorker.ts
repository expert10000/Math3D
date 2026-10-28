import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

export const LOCAL_SYMBOLIC_OPERATIONS = [
  "sage.symbolic.simplify", "sage.symbolic.factor", "sage.symbolic.expand", "sage.symbolic.solve",
  "sage.symbolic.gradient", "sage.symbolic.hessian", "sage.symbolic.singularities",
] as const;
export type LocalSymbolicOperation = typeof LOCAL_SYMBOLIC_OPERATIONS[number];

// Parse only arithmetic syntax into Sage objects. No Sage/Python expression evaluator receives user text.
const SAGE_SYMBOLIC_SCRIPT = String.raw`
import ast
import json
import re
import sys
from sage.all import QQ, SR, cos, e, exp, latex, log, pi, sin, solve, sqrt, tan, var

request = json.load(sys.stdin)
operation = request["operation"]
params = request["parameters"]
expression = params.get("expression")
variables = params.get("variables")
if not isinstance(expression, str) or not expression.strip() or len(expression) > 512:
    raise ValueError("Enter a mathematical expression of at most 512 characters.")
if not isinstance(variables, list) or not 1 <= len(variables) <= 8 or any(
    not isinstance(name, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,31}", name)
    for name in variables
):
    raise ValueError("Enter 1–8 valid variable names.")
functions = {"sin": sin, "cos": cos, "tan": tan, "exp": exp, "log": log, "sqrt": sqrt}
if len(set(variables)) != len(variables) or any(name in functions or name in ("pi", "e") for name in variables):
    raise ValueError("Variable names must be unique and must not shadow functions or constants.")
symbols = {name: var(name) for name in variables}
names = {**symbols, "pi": pi, "e": e}
count = 0

def convert(node, depth=0):
    global count
    count += 1
    if count > 256 or depth > 32:
        raise ValueError("Expression is too complex.")
    if isinstance(node, ast.Constant) and type(node.value) is int:
        if len(str(abs(node.value))) > 18:
            raise ValueError("Integer literal exceeds 18 digits.")
        return SR(node.value)
    if isinstance(node, ast.Constant) and type(node.value) is float:
        return SR(QQ(str(node.value)))
    if isinstance(node, ast.Name) and node.id in names:
        return names[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = convert(node.operand, depth + 1)
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp):
        left = convert(node.left, depth + 1)
        right = convert(node.right, depth + 1)
        if isinstance(node.op, ast.Add): return left + right
        if isinstance(node.op, ast.Sub): return left - right
        if isinstance(node.op, ast.Mult): return left * right
        if isinstance(node.op, ast.Div): return left / right
        if isinstance(node.op, ast.Pow):
            if right not in SR or not right.is_integer() or abs(int(right)) > 64:
                raise ValueError("Exponent must be an integer between -64 and 64.")
            return left ** int(right)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in functions:
        if len(node.args) == 1 and not node.keywords:
            return functions[node.func.id](convert(node.args[0], depth + 1))
    raise ValueError("Expression contains unsupported syntax. Use arithmetic, variables, and sin/cos/tan/exp/log/sqrt.")

def parse(text):
    try:
        return convert(ast.parse(text.replace("^", "**"), mode="eval").body)
    except SyntaxError:
        raise ValueError("Expression syntax is invalid.")

if operation == "sage.symbolic.solve":
    if expression.count("=") > 1:
        raise ValueError("Use one equation with at most one equals sign.")
    parts = expression.split("=")
    left = parse(parts[0]); right = parse(parts[1]) if len(parts) == 2 else SR(0)
    value = solve(left == right, [symbols[name] for name in variables], solution_dict=True)
    result = {"solutions": [str(item) for item in value], "text": str(value)}
else:
    value = parse(expression)
    if operation == "sage.symbolic.simplify": value = value.simplify_full()
    elif operation == "sage.symbolic.factor": value = value.factor()
    elif operation == "sage.symbolic.expand": value = value.expand()
    elif operation in ("sage.symbolic.gradient", "sage.symbolic.hessian", "sage.symbolic.singularities"):
        if len(variables) != 3 or set(variables) != {"x", "y", "z"}:
            raise ValueError("Surface calculus requires x, y, z as the three variables.")
        axes = [symbols[name] for name in ("x", "y", "z")]
        gradient = [value.diff(axis).simplify_full() for axis in axes]
        if operation == "sage.symbolic.gradient":
            result = {"components": [str(item) for item in gradient], "text": str(gradient)}
            value = gradient
        elif operation == "sage.symbolic.hessian":
            matrix = [[item.diff(axis).simplify_full() for axis in axes] for item in gradient]
            result = {"matrix": [[str(item) for item in row] for row in matrix], "text": str(matrix)}
            value = matrix
        else:
            solutions = solve([value == 0] + [item == 0 for item in gradient], axes, solution_dict=True)
            if len(solutions) > 64:
                raise ValueError("More than 64 singularities; narrow the surface equation.")
            if any(any(axis not in solution for axis in axes) for solution in solutions):
                raise ValueError("The singular set is not a finite list of isolated points.")
            result = {"points": [{str(axis): str(solution[axis]) for axis in axes if axis in solution} for solution in solutions],
                      "text": str(solutions), "criterion": "F=0 and gradient F=0"}
            value = solutions
    else: raise ValueError("Unsupported local Sage operation.")
    if operation not in ("sage.symbolic.gradient", "sage.symbolic.hessian", "sage.symbolic.singularities"):
        result = {"text": str(value)}
print(json.dumps({"schemaVersion": 1, "jobId": request["jobId"], "operation": operation,
    "status": "succeeded", "result": result, "latex": str(latex(value))}, separators=(",", ":")))
`;

type ActiveJob = { child: ChildProcessWithoutNullStreams; cancelled: boolean };
const activeJobs = new Map<string, ActiveJob>();

export async function checkLocalSageHealth(): Promise<Record<string, unknown>> {
  const operations = [...LOCAL_SYMBOLIC_OPERATIONS, "sage.polynomial.factor", "sage.polynomial.roots_exact"];
  return new Promise((resolve) => {
    const child = spawn("wsl.exe", ["-d", "Ubuntu", "--exec", "/usr/bin/sage", "--version"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let settled = false;
    const finish = (available: boolean, status: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ engine: "sagemath", available, status, operations });
    };
    const timer = setTimeout(() => { child.kill(); finish(false, "Local SageMath check exceeded 12 seconds."); }, 12_000);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8").slice(0, 256); });
    child.once("error", () => finish(false, "SageMath is unavailable in WSL Ubuntu."));
    child.once("close", (code) => finish(code === 0, code === 0
      ? `Local WSL ${output.trim() || "SageMath installed"}`
      : "SageMath is unavailable in WSL Ubuntu."));
  });
}

export function cancelSageSymbolicJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.cancelled = true;
  job.child.kill();
  return true;
}

export async function runSageSymbolicJob(
  operation: LocalSymbolicOperation,
  params: Record<string, unknown>,
  requestedJobId?: string,
): Promise<Record<string, unknown>> {
  if (!LOCAL_SYMBOLIC_OPERATIONS.includes(operation)) throw new Error("Unsupported local Sage operation.");
  if (typeof params.expression !== "string" || !params.expression.trim() || params.expression.length > 512) {
    throw new Error("Enter a mathematical expression of at most 512 characters.");
  }
  if (!Array.isArray(params.variables) || params.variables.length < 1 || params.variables.length > 8 ||
    !params.variables.every((name) => typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name))) {
    throw new Error("Enter 1–8 valid variable names.");
  }
  if (activeJobs.size > 0) throw new Error("A local Sage symbolic job is already running.");
  const jobId = requestedJobId ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid Sage job identifier.");
  const parameters = { expression: params.expression, variables: params.variables };
  const inputHash = createHash("sha256").update(JSON.stringify(parameters)).digest("hex");
  const started = Date.now();
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn("wsl.exe", [
      "-d", "Ubuntu", "--exec", "/usr/bin/timeout", "--kill-after=1s", "20s",
      "/usr/bin/prlimit", "--as=4294967296", "--cpu=18", "--",
      "/usr/bin/sage", "-python", "-c", SAGE_SYMBOLIC_SCRIPT,
    ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const job: ActiveJob = { child, cancelled: false };
    activeJobs.set(jobId, job);
    let stdout = ""; let stderr = ""; let settled = false; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 25_000);
    const finish = (error?: Error, result?: Record<string, unknown>) => {
      if (settled) return;
      settled = true; clearTimeout(timer); activeJobs.delete(jobId);
      if (error) reject(error); else resolve(result ?? {});
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > 65_536) { child.kill(); finish(new Error("Sage output exceeded 64 KiB.")); }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr) > 65_536) { child.kill(); finish(new Error("Sage diagnostics exceeded 64 KiB.")); }
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (job.cancelled) return finish(new Error("Sage symbolic job cancelled."));
      if (timedOut || code === 124) return finish(new Error("Sage symbolic job exceeded the 20-second limit."));
      if (code !== 0) {
        const rejected = stderr.match(/(?:ValueError|SyntaxError): ([^\r\n]+)/);
        return finish(new Error(rejected ? rejected[1] : `Sage worker exited with code ${code}.`));
      }
      try {
        const reply = JSON.parse(stdout.trim()) as Record<string, unknown>;
        if (reply.schemaVersion !== 1 || reply.jobId !== jobId || reply.operation !== operation ||
          reply.status !== "succeeded" || !reply.result || typeof reply.latex !== "string") {
          throw new Error("Sage worker returned an invalid symbolic contract.");
        }
        finish(undefined, { engine: "sagemath", operation, success: true, latex: reply.latex,
          result: { ...(reply.result as object), schemaVersion: 1, jobId, inputHash,
            diagnostics: ["Parsed with a bounded arithmetic AST; no expression evaluator used."] },
          warnings: [], elapsedMs: Date.now() - started });
      } catch (error) { finish(error instanceof Error ? error : new Error("Invalid Sage worker JSON.")); }
    });
    child.stdin.on("error", (error) => finish(error));
    child.stdin.end(JSON.stringify({ schemaVersion: 1, jobId, operation, parameters }));
  });
}
