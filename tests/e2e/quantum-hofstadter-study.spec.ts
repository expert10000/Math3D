import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-9e46f98c78e842ebb12c92d5a73e8446-hofstadter.qscene");
const producer = JSON.parse(readFileSync(resolve(__dirname, "..", "fixtures", "quantum-scene", "hofstadter-producer-result.json"), "utf8"));
const cwd = resolve(__dirname, "..", "..");

test("Harper bands reopen with exact source sample inspection", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-hofstadter-"));
  try {
    for (let launch = 0; launch < 2; launch++) {
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd,
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
      try {
        const page = await app.firstWindow();
        const profile = page.getByTestId("hofstadter-study-profile");
        await expect(profile).toContainText("Hofstadter · verified Harper bands");
        await expect(profile).toContainText("p/q=1/4");
        await expect(profile).toContainText("no Harper spectrum, Chern number or edge state");
        await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
        const selected = page.getByTestId("quantum-band-selection");
        await expect(selected).toContainText("band index: 0");
        await expect(selected).toContainText("dataset index: 0");
        await expect(selected).toContainText(`kx: ${producer.analysis.kxValues[0].toPrecision(8)} rad / lattice constant`);
        await expect(selected).toContainText(`ky: ${producer.analysis.kyValues[0].toPrecision(8)} rad / lattice constant`);
        await expect(selected).toContainText(`Energy: ${producer.analysis.bandEnergies[0][0].toPrecision(8)} hopping energy`);
        await expect(selected).toContainText(producer.runId);
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-hofstadter-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("Harper bands refuse changed bytes on selection and after restart", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-hofstadter-")), source = join(root, "altered.qscene");
  try {
    await cp(fixture, source, { recursive: true });
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("hofstadter-study-profile")).toBeVisible();
      const file = join(source, "band-0-energy.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-band-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const refused = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "retry") } });
    try {
      const page = await refused.firstWindow();
      await expect(page.getByTestId("hofstadter-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await refused.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-hofstadter-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
