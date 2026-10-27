import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const cwd = resolve(__dirname, "..", "..");
const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-93c5726d6bce49e1b752916c751281e3-hofstadter.qscene");
const producer = JSON.parse(readFileSync(resolve(__dirname, "..", "fixtures", "quantum-scene", "hofstadter-chern-producer-result.json"), "utf8"));

test("verified occupied-gap Chern scene reopens with exact flux and band samples", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-hofstadter-chern-"));
  try {
    for (let launch = 0; launch < 2; launch++) {
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd,
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
      try {
        const page = await app.firstWindow();
        const profile = page.getByTestId("hofstadter-study-profile");
        await expect(profile).toContainText("occupied-gap Chern");
        await expect(page.getByTestId("hofstadter-chern-status")).toContainText("Occupied 1 Chern -1 (verified)");
        await expect(page.getByTestId("hofstadter-chern-status")).toContainText("Occupied 2 Chern undefined (undefined)");
        await expect(page.getByTestId("hofstadter-chern-status")).toContainText("Occupied 3 Chern 1 (verified)");
        await page.getByRole("button", { name: "Inspect first topology sample occupied-1-berry-flux" }).click();
        const selected = page.getByTestId("quantum-topology-selection");
        await expect(selected).toContainText("dataset index: 0");
        await expect(selected).toContainText(`Value: ${producer.analysis.chernGaps[0].plaquetteFlux[0].toPrecision(10)} rad per plaquette`);
        await expect(selected).toContainText(producer.runId);
        await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
        await expect(page.getByTestId("quantum-band-selection")).toContainText(
          `Energy: ${producer.analysis.bandEnergies[0][0].toPrecision(8)} hopping energy`);
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-hofstadter-chern-")) throw new Error("Unsafe cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("changed FHS flux bytes are refused on selection and restart", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-hofstadter-chern-")), source = join(root, "changed.qscene");
  try {
    await cp(fixture, source, { recursive: true });
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("hofstadter-chern-status")).toBeVisible();
      const file = join(source, "occupied-1-plaquette-flux.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect first topology sample occupied-1-berry-flux" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-topology-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const refused = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "retry") } });
    try {
      const page = await refused.firstWindow();
      await expect(page.getByTestId("hofstadter-chern-status")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await refused.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-hofstadter-chern-")) throw new Error("Unsafe cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
