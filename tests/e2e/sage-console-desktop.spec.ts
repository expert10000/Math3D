import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("Sage Console requires local trust and publishes provenance through Compute jobs", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-console-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root } });
    const page = await app.firstWindow();
    await page.getByTestId("top-sage-console-button").click();
    const dock = page.getByTestId("sage-console-dock");
    await expect(dock).toContainText("SageMath 9.5", { timeout: 30_000 });
    await expect(dock.getByTestId("sage-console-run")).toBeDisabled();
    await expect(page.evaluate(() => (window as any).sageConsole.run({ jobId: crypto.randomUUID(), code: "2^10" })))
      .rejects.toThrow("Trust the local Sage runtime");
    await dock.getByTestId("sage-console-code").fill("print('hello')\n2^10");
    await dock.getByTestId("sage-console-trust").check();
    await dock.getByTestId("sage-console-run").click();
    await expect(dock.getByTestId("sage-console-state")).toContainText("succeeded", { timeout: 60_000 });
    await expect(dock.getByTestId("sage-console-output")).toContainText("hello\n1024");
    await expect(dock.getByTestId("sage-console-provenance")).toContainText("sage-local-wsl");
    await expect(dock.getByTestId("sage-console-provenance")).toContainText(/Source SHA-256: [0-9a-f]{64}/);
    await dock.getByTestId("sage-console-code").fill("import time\ntime.sleep(10)");
    await dock.getByTestId("sage-console-run").click();
    await expect(dock.getByTestId("sage-console-state")).toContainText("running");
    await dock.getByTestId("sage-console-cancel").click();
    await expect(dock.getByTestId("sage-console-state")).toContainText("cancelled", { timeout: 30_000 });
    await page.getByTestId("top-compute-center-button").click();
    await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })).toContainText("Sage Console");
    await page.getByTestId("compute-center").getByRole("button", { name: "Runtimes", exact: true }).click();
    await expect(page.getByTestId("sage-runtime-console-limits")).toContainText("20 s execution");
    await page.getByTestId("compute-center").getByRole("button", { name: "Close", exact: true }).click();
    await dock.getByRole("button", { name: "Close Sage Console" }).click();
    await page.getByTestId("top-sage-console-button").click();
    await expect(page.getByTestId("sage-console-trust")).not.toBeChecked();
    await expect(page.getByTestId("sage-console-run")).toBeDisabled();
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
