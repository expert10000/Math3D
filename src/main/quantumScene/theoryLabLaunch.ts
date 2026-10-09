import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { app, BrowserWindow, dialog } from "electron";

const CONFIG_FILE = "theory-lab-target.json";
const CONFIG_SCHEMA = "math3d/theory-lab-target/v1";
export type TheoryLabTarget = { directory: string; executable: string };

async function targetExecutable(directory: string): Promise<string> {
  if (!isAbsolute(directory) || resolve(directory) !== directory || directory.includes("\0"))
    throw new Error("Choose an absolute Theory Lab checkout folder");
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
  return executable;
}

async function savedTarget(): Promise<string | null> {
  try {
    const file = join(app.getPath("userData"), CONFIG_FILE), info = await stat(file);
    if (!info.isFile() || info.size > 4096) return null;
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().join(",") === "directory,schema" &&
      record.schema === CONFIG_SCHEMA && typeof record.directory === "string" ? record.directory : null;
  } catch { return null; }
}

async function rememberTarget(directory: string): Promise<void> {
  const parent = app.getPath("userData"), temp = join(parent, `${CONFIG_FILE}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify({ schema: CONFIG_SCHEMA, directory }) + "\n", { flag: "wx" });
    await rename(temp, join(parent, CONFIG_FILE));
  } finally { await unlink(temp).catch(() => {}); }
}

export async function chooseTheoryLabTarget(win: BrowserWindow): Promise<TheoryLabTarget | null> {
  const configured = process.env.MATH3D_THEORY_LAB_HOME || await savedTarget();
  if (configured) {
    try { return { directory: configured, executable: await targetExecutable(configured) }; }
    catch (error) { if (process.env.MATH3D_THEORY_LAB_HOME) throw error; }
  }
  const choice = await dialog.showOpenDialog(win, {
    title: "Choose your Theory Lab checkout folder (once)", properties: ["openDirectory"],
  });
  if (choice.canceled || !choice.filePaths[0]) return null;
  const directory = resolve(choice.filePaths[0]);
  const executable = await targetExecutable(directory);
  await rememberTarget(directory);
  return { directory, executable };
}

export async function launchTheoryLab(target: TheoryLabTarget, runId: string, resultSha256: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId) || !/^[a-f0-9]{64}$/.test(resultSha256))
    throw new Error("Invalid verified source-run identity");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  await new Promise<void>((done, fail) => {
    const child = spawn(target.executable,
      [target.directory, "--quantum-source-run", runId, resultSha256],
      { cwd: target.directory, env, detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", fail);
    child.once("spawn", () => { child.unref(); done(); });
  });
}
