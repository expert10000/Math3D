import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { openScientificHeightSurface, type ScientificHeightSurface } from "./heightSurface";

const MAX_SCRIPT_BYTES = 256 * 1024;
const MAX_SPEC_BYTES = 32 * 1024 * 1024;
const MAX_DIAGNOSTIC_BYTES = 8192;
export const PYTHON_PUBLISH_TIMEOUT_MS = 60_000;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export type PreparedPythonPublisher = Readonly<{
  sessionId: string;
  executable: string;
  script: string;
  spec: string;
  output: string;
  scriptSha256: string;
  specSha256: string;
  sourceHash: string;
}>;

const boundedFile = async (path: string, limit: number): Promise<Buffer> => {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > limit)
    throw new Error("Selected Python publisher source is not a bounded regular file");
  const bytes = await readFile(path);
  if (bytes.length !== info.size) throw new Error("Selected Python publisher source changed while reading");
  return bytes;
};

const absent = async (path: string): Promise<boolean> => {
  try { await lstat(path); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; }
};

export async function preparePythonPublisher(executable: string, script: string, spec: string,
  output: string): Promise<PreparedPythonPublisher> {
  if (![executable, script, spec, output].every(path => typeof path === "string" && isAbsolute(path) &&
      resolve(path) === path && !path.includes("\0")) || !script.toLowerCase().endsWith(".py") ||
      !spec.toLowerCase().endsWith(".json") || !output.toLowerCase().endsWith(".sscene"))
    throw new TypeError("Choose absolute Python, .py, .json and new .sscene paths");
  const executableInfo = await lstat(executable);
  if (!(executableInfo.isFile() || executableInfo.isSymbolicLink())) throw new Error("Python executable is not a file");
  const scriptBytes = await boundedFile(script, MAX_SCRIPT_BYTES);
  const specBytes = await boundedFile(spec, MAX_SPEC_BYTES);
  if (!(await lstat(dirname(output))).isDirectory() || !(await absent(output)))
    throw new Error("The .sscene destination already exists or its parent is unavailable");
  const scriptSha256 = sha(scriptBytes), specSha256 = sha(specBytes);
  return { sessionId: randomUUID(), executable, script, spec, output, scriptSha256, specSha256,
    sourceHash: createHash("sha256").update(`${scriptSha256}:${specSha256}`).digest("hex") };
}

export type PythonPublisherRun = Readonly<{ promise: Promise<ScientificHeightSurface>; cancel: () => boolean }>;

export function runPythonPublisher(prepared: PreparedPythonPublisher,
  timeoutMs = PYTHON_PUBLISH_TIMEOUT_MS): PythonPublisherRun {
  let child: ChildProcessWithoutNullStreams | null = null;
  let cancelled = false;
  let timedOut = false;
  let committing = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let escalation: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (!child || child.exitCode !== null) return;
    child.kill();
    if (!escalation) escalation = setTimeout(() => child?.kill("SIGKILL"), 1000);
  };
  const cancel = () => {
    if (committing || settled) return false;
    cancelled = true; stop(); return true;
  };
  const promise = (async (): Promise<ScientificHeightSurface> => {
    const scriptBytes = await boundedFile(prepared.script, MAX_SCRIPT_BYTES);
    const specBytes = await boundedFile(prepared.spec, MAX_SPEC_BYTES);
    if (sha(scriptBytes) !== prepared.scriptSha256 || sha(specBytes) !== prepared.specSha256)
      throw new Error("Python publisher script or spec changed before run");
    if (cancelled) throw new Error("Python publisher job cancelled");
    if (timedOut) throw new Error("Python publisher job timed out");
    if (!(await absent(prepared.output))) throw new Error("The .sscene destination already exists");
    const parent = dirname(prepared.output);
    const temporary = await mkdtemp(join(parent, ".math3d-publisher-"));
    try {
      const script = join(temporary, "publisher.py"), spec = join(temporary, "source.json");
      const staged = join(temporary, "published.sscene");
      await writeFile(script, scriptBytes, { flag: "wx" });
      await writeFile(spec, specBytes, { flag: "wx" });
      if (cancelled) throw new Error("Python publisher job cancelled");
      if (timedOut) throw new Error("Python publisher job timed out");
      let stderr = "", stdout = "", diagnosticsExceeded = false;
      const exitCode = await new Promise<number | null>((done, fail) => {
        child = spawn(prepared.executable, ["-I", script, "--spec", spec, "--output", staged],
          { cwd: temporary, env: { ...process.env, PYTHONPATH: "", PYTHONNOUSERSITE: "1" },
            windowsHide: true, shell: false, stdio: "pipe" });
        const childProcess = child;
        const collect = (chunk: Buffer, stream: "stdout" | "stderr") => {
          const value = stream === "stdout" ? stdout + String(chunk) : stderr + String(chunk);
          if (Buffer.byteLength(value) > MAX_DIAGNOSTIC_BYTES) { diagnosticsExceeded = true; stop(); return; }
          if (stream === "stdout") stdout = value; else stderr = value;
        };
        childProcess.stdout.on("data", (chunk: Buffer) => collect(chunk, "stdout"));
        childProcess.stderr.on("data", (chunk: Buffer) => collect(chunk, "stderr"));
        childProcess.once("error", fail);
        childProcess.once("close", done);
        if (cancelled) stop();
      });
      if (cancelled) throw new Error("Python publisher job cancelled");
      if (timedOut) throw new Error("Python publisher job timed out");
      if (diagnosticsExceeded) throw new Error("Python publisher diagnostics exceeded the limit");
      if (exitCode !== 0) throw new Error(`Python publisher failed (${exitCode}): ${stderr.slice(-2000)}`);
      const scene = await openScientificHeightSurface(staged);
      if (sha(await boundedFile(prepared.script, MAX_SCRIPT_BYTES)) !== prepared.scriptSha256 ||
          sha(await boundedFile(prepared.spec, MAX_SPEC_BYTES)) !== prepared.specSha256)
        throw new Error("Python publisher script or spec changed during run");
      if (cancelled || timedOut) throw new Error("Python publisher job cancelled or timed out");
      if (!(await absent(prepared.output))) throw new Error("The .sscene destination already exists");
      committing = true;
      if (timer) clearTimeout(timer);
      await mkdir(prepared.output);
      const marker = `.math3d-publishing-${randomUUID()}`;
      const names = ["bundle.json", "manifest.json", ...scene.manifest.resources.map(resource => resource.path)];
      let published = false;
      try {
        await writeFile(join(prepared.output, marker), prepared.sessionId, { flag: "wx" });
        for (const name of names) await rename(join(staged, name), join(prepared.output, name));
        await unlink(join(prepared.output, marker));
        published = true;
        return await openScientificHeightSurface(prepared.output);
      } finally {
        if (!published) {
          const entries = await readdir(prepared.output).catch(() => []);
          const owner = await readFile(join(prepared.output, marker), "utf8").catch(() => null);
          const directoryInfo = await lstat(prepared.output).catch(() => null);
          if (directoryInfo?.isDirectory() && !directoryInfo.isSymbolicLink() &&
              owner === prepared.sessionId && entries.every(name => name === marker || names.includes(name)))
            await rm(prepared.output, { recursive: true, force: true });
        }
      }
    } finally {
      if (escalation) clearTimeout(escalation);
      child = null;
      if (!temporary.startsWith(resolve(parent) + sep) ||
          !temporary.includes(".math3d-publisher-")) throw new Error("Unsafe Python publisher cleanup path");
      await rm(temporary, { recursive: true, force: true });
    }
  })();
  timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
  return { promise: promise.finally(() => { settled = true; if (timer) clearTimeout(timer); }), cancel };
}
