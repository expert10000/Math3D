import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type ElectronLaunchOptions = NonNullable<Parameters<typeof electron.launch>[0]>;

type EnsureElectronModule = {
  ensureElectronExecutablePath: () => Promise<string>;
};

let executablePathPromise: Promise<string> | null = null;

async function resolveExecutablePathOnce(): Promise<string> {
  if (!executablePathPromise) {
    executablePathPromise = (async () => {
      const ensureModule = (await import("../../../scripts/ensure-electron-install.mjs")) as EnsureElectronModule;
      return ensureModule.ensureElectronExecutablePath();
    })();
  }
  return executablePathPromise;
}

function withIsolatedProfileArgs(args: string[], userDataDir: string, cacheDir: string): string[] {
  const profileArgs = [
    `--user-data-dir=${userDataDir}`,
    `--disk-cache-dir=${cacheDir}`,
    `--media-cache-dir=${path.join(cacheDir, "media")}`,
  ];
  const appPathIndex = args.findIndex((arg) => arg && !arg.startsWith("-"));
  if (appPathIndex < 0) return [...profileArgs, ...args];
  return [...args.slice(0, appPathIndex), ...profileArgs, ...args.slice(appPathIndex)];
}

export async function launchRepoElectron(options: ElectronLaunchOptions): Promise<ElectronApplication> {
  const executablePath = await resolveExecutablePathOnce();
  const providedEnv = options.env as Record<string, string | undefined> | undefined;
  const profileRoot = providedEnv?.MATH3D_E2E_PROFILE_ROOT
    ? path.resolve(providedEnv.MATH3D_E2E_PROFILE_ROOT)
    : providedEnv?.LOCALAPPDATA || providedEnv?.APPDATA
    ? path.join(path.resolve(String(providedEnv.LOCALAPPDATA || providedEnv.APPDATA)), "electron-profile")
    : mkdtempSync(path.join(os.tmpdir(), "math3d-electron-e2e-"));
  const userDataDir = path.join(profileRoot, "user-data");
  const cacheDir = path.join(profileRoot, "cache");
  const env: Record<string, string | undefined> = {
    ...(providedEnv ?? process.env),
    MATH3D_E2E: "1",
    MATH3D_E2E_USER_DATA_DIR: userDataDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = options.args ?? ["."];
  return electron.launch({
    ...options,
    args: withIsolatedProfileArgs(args, userDataDir, cacheDir),
    env,
    executablePath,
  });
}
