import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { app, BrowserWindow, dialog } from "electron";

const CONFIG_FILE = "theory-lab-target.json";
const CONFIG_SCHEMA = "math3d/theory-lab-target/v2";
export type TheoryLabTarget = { kind: "checkout" | "installed"; directory: string; executable: string };

async function targetExecutable(path: string): Promise<TheoryLabTarget> {
  if (!isAbsolute(path) || resolve(path) !== path || path.includes("\0"))
    throw new Error("Choose an absolute Theory Lab executable or checkout folder");
  if (process.platform === "win32" && path.toLowerCase().endsWith(".exe")) {
    if (basename(path).toLowerCase() !== "quantum hamiltonian lab.exe")
      throw new Error("Selected executable is not Quantum Hamiltonian Lab");
    const directory = dirname(path);
    for (const file of [path,
      join(directory, "resources", "app.asar", "dist", "main.cjs"),
      join(directory, "resources", "app.asar", "dist", "preload.cjs"),
      join(directory, "resources", "app.asar", "dist", "index.html"),
      join(directory, "resources", "quantum-worker", "quantum-worker.exe"),
      join(directory, "resources", "packages", "contracts", "schemas", "quantum-job.v1.json")])
      if (!(await stat(file)).isFile()) throw new Error(`Theory Lab installation is incomplete: ${file}`);
    return { kind: "installed", directory, executable: path };
  }
  const directory = path;
  const packageInfo: unknown = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (!packageInfo || typeof packageInfo !== "object" || (packageInfo as { name?: unknown }).name !== "theory-lab")
    throw new Error("Selected folder is not a Theory Lab checkout");
  const executable = process.platform === "win32"
    ? join(directory, "node_modules", "electron", "dist", "electron.exe")
    : process.platform === "darwin"
      ? join(directory, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron")
      : join(directory, "node_modules", "electron", "dist", "electron");
  for (const file of [executable, join(directory, "dist", "main.cjs"),
    join(directory, "dist", "preload.cjs"), join(directory, "dist", "index.html")]) {
    if (!(await stat(file)).isFile()) throw new Error(`Theory Lab is not built: ${file}`);
  }
  return { kind: "checkout", directory, executable };
}

async function savedTarget(): Promise<string | null> {
  try {
    const file = join(app.getPath("userData"), CONFIG_FILE), info = await stat(file);
    if (!info.isFile() || info.size > 4096) return null;
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") === "path,schema" &&
        record.schema === CONFIG_SCHEMA && typeof record.path === "string") return record.path;
    // Preserve a user's previously selected source checkout.
    return Object.keys(record).sort().join(",") === "directory,schema" &&
      record.schema === "math3d/theory-lab-target/v1" && typeof record.directory === "string" ? record.directory : null;
  } catch { return null; }
}

async function rememberTarget(path: string): Promise<void> {
  const parent = app.getPath("userData"), temp = join(parent, `${CONFIG_FILE}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify({ schema: CONFIG_SCHEMA, path }) + "\n", { flag: "wx" });
    await rename(temp, join(parent, CONFIG_FILE));
  } finally { await unlink(temp).catch(() => {}); }
}

export async function chooseTheoryLabTarget(win: BrowserWindow): Promise<TheoryLabTarget | null> {
  const configured = process.env.MATH3D_THEORY_LAB_HOME || await savedTarget();
  if (configured) {
    try { return await targetExecutable(configured); }
    catch (error) { if (process.env.MATH3D_THEORY_LAB_HOME) throw error; }
  }
  const mode = await dialog.showMessageBox(win, { type: "question", title: "Theory Lab location",
    message: "Where is Quantum Hamiltonian Lab?",
    buttons: ["Installed application", "Source checkout", "Cancel"], cancelId: 2, noLink: true });
  if (mode.response === 2) return null;
  const choice = await dialog.showOpenDialog(win, {
    title: mode.response === 0 ? "Choose Quantum Hamiltonian Lab.exe" : "Choose your Theory Lab checkout folder",
    properties: [mode.response === 0 ? "openFile" : "openDirectory"],
    ...(mode.response === 0 ? { filters: [{ name: "Quantum Hamiltonian Lab", extensions: ["exe"] }] } : {}),
  });
  if (choice.canceled || !choice.filePaths[0]) return null;
  const path = resolve(choice.filePaths[0]);
  const target = await targetExecutable(path);
  await rememberTarget(path);
  return target;
}

export async function launchTheoryLab(target: TheoryLabTarget, runId: string, resultSha256: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId) || !/^[a-f0-9]{64}$/.test(resultSha256))
    throw new Error("Invalid verified source-run identity");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  // A loopback DevTools endpoint lets the isolated two-app acceptance inspect
  // the real Lab window. Ordinary launches never enable remote debugging.
  const debugPort = env.MATH3D_E2E === "1" ? env.MATH3D_E2E_LAB_DEBUG_PORT : undefined;
  const debugArgs = debugPort && /^(?:[1-9]\d{3,4})$/.test(debugPort) && Number(debugPort) <= 65535
    ? ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${debugPort}`] : [];
  delete env.MATH3D_E2E_LAB_DEBUG_PORT;
  await new Promise<void>((done, fail) => {
    const child = spawn(target.executable,
      [...debugArgs, ...(target.kind === "checkout" ? [target.directory] : []),
        "--quantum-source-run", runId, resultSha256],
      { cwd: target.directory, env, detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", fail);
    child.once("spawn", () => { child.unref(); done(); });
  });
}
