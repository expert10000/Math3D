import { _electron as electron, type ElectronApplication } from "playwright";

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

export async function launchRepoElectron(options: ElectronLaunchOptions): Promise<ElectronApplication> {
  const executablePath = await resolveExecutablePathOnce();
  const env = {
    ...(options.env ?? process.env),
    MATH3D_E2E: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    ...options,
    env,
    executablePath,
  });
}
