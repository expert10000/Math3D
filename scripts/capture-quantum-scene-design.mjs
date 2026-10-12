#!/usr/bin/env node

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { ensureElectronExecutablePath } from "./ensure-electron-install.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "docs", "assets", "screenshots", "quantum-scenes-design-2026-10-12");
const profile = await mkdtemp(join(tmpdir(), "math3d-quantum-capture-"));
const scenes = [
  ["qwz-curvature", "01-qwz-curvature"],
  ["qwz-bands", "02-qwz-bands"],
  ["ssh-chain", "03-ssh-chain"],
  ["ssh-bands", "04-ssh-bands"],
  ["hydrogen-1s", "05-hydrogen-1s-slice"],
  ["hydrogen-2s", "06-hydrogen-2s-slice"],
  ["hydrogen-2p", "07-hydrogen-2p-slice"],
  ["hydrogen-3p", "08-hydrogen-3p-slice"],
  ["hydrogen-3d", "09-hydrogen-3d-slice"],
];

await mkdir(output, { recursive: true });
const app = await electron.launch({
  executablePath: await ensureElectronExecutablePath(),
  args: ["."],
  cwd: root,
  env: {
    ...process.env,
    MATH3D_E2E: "1",
    MATH3D_E2E_USER_DATA_DIR: join(profile, "user-data"),
  },
  timeout: 60_000,
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
    [data-testid="quantum-source-directory"] { font-size: 0 !important; }
    [data-testid="quantum-source-directory"]::after { content: "[verified local bundle]"; font-size: 12px; }
  ` });

  async function openChooser() {
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-scene-examples").waitFor({ state: "visible" });
  }
  async function capture(name) {
    const preview = page.getByTestId("quantum-scene-preview");
    await preview.waitFor({ state: "visible" });
    await page.waitForTimeout(700);
    await preview.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
    process.stdout.write(`[quantum-scenes] ${name}.png\n`);
  }

  await openChooser();
  await page.getByTestId("quantum-scene-examples").screenshot({
    path: join(output, "00-example-library.png"), animations: "disabled",
  });
  process.stdout.write("[quantum-scenes] 00-example-library.png\n");

  for (const [id, name] of scenes) {
    if (id !== scenes[0][0]) await openChooser();
    await page.getByTestId(`quantum-example-${id}`).click();
    await page.getByTestId("quantum-scene-preview").waitFor({ state: "visible" });
    if (id.startsWith("hydrogen-")) await page.getByTestId("quantum-field-slice").waitFor({ state: "visible" });
    await capture(name);
    if (id === "qwz-curvature") {
      await page.getByRole("button", { name: "Reciprocal space" }).click();
      await capture("01b-qwz-curvature-reciprocal");
    }
    if (id === "hydrogen-2p" || id === "hydrogen-3d") {
      await page.getByRole("button", { name: "Density surface" }).click();
      await page.getByTestId("quantum-field-surface").waitFor({ state: "visible" });
      await capture(id === "hydrogen-2p" ? "07b-hydrogen-2p-surface" : "09b-hydrogen-3d-surface");
    }
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("quantum-scene-preview").waitFor({ state: "hidden" });
  }
} finally {
  await app.close();
  if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-quantum-capture-"))
    throw new Error("Unsafe temporary profile cleanup path");
  await rm(profile, { recursive: true, force: true });
}
