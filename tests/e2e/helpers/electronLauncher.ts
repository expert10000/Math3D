import { _electron as electron, type ElectronApplication } from "playwright";

type ElectronLaunchOptions = NonNullable<Parameters<typeof electron.launch>[0]>;

type EnsureElectronModule = {
  ensureElectronExecutablePath: () => Promise<string>;
};

export async function launchRepoElectron(options: ElectronLaunchOptions): Promise<ElectronApplication> {
  const ensureModule = (await import("../../../scripts/ensure-electron-install.mjs")) as EnsureElectronModule;
  const executablePath = await ensureModule.ensureElectronExecutablePath();
  return electron.launch({
    ...options,
    executablePath,
  });
}
