import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const repo = resolve(__dirname, "..", "..");
const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-19f513c1ee9d4d1f8716a590fc7f1dc0-pump.qscene");
const resultFile = resolve(__dirname, "..", "fixtures", "quantum-scene", "rice-mele-pump-producer-result.json");
const finiteFixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-91b9adc301184ef9be91ea7fe2b7af73-finite-pump.qscene");
const finiteResultFile = resolve(__dirname, "..", "fixtures", "quantum-scene", "rice-mele-finite-producer-result.json");

test("finite-speed Rice–Mele scene inspects exact saved samples after restart", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-rice-finite-"));
  const result = JSON.parse(await readFile(finiteResultFile, "utf8"));
  const launch = () => launchRepoElectron({ args: [".", "--quantum-scene", finiteFixture], cwd: repo,
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    for (let opening = 0; opening < 2; opening++) {
      const app = await launch();
      try {
        const page = await app.firstWindow();
        const profile = page.getByTestId("rice-mele-finite-pump-profile");
        await expect(profile).toContainText("finite-speed filled-band transport");
        await expect(profile).toContainText("not labelled quantized");
        await expect(profile).toContainText(result.runId);
        await page.getByRole("button", { name: "Inspect finite pump later current sample" }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.analysis.dynamics.current[8].toPrecision(10));
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.runId);
        await page.getByRole("button", { name: "Inspect finite pump first sample of finite-charge" }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.analysis.dynamics.charge[0].toPrecision(10));
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-rice-finite-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("finite-speed Rice–Mele scene refuses tampered current bytes on selection and restart", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-rice-finite-"));
  const altered = join(root, "altered.qscene");
  try {
    await cp(finiteFixture, altered, { recursive: true });
    const launch = () => launchRepoElectron({ args: [".", "--quantum-scene", altered], cwd: repo,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    const app = await launch();
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("rice-mele-finite-pump-profile")).toBeVisible();
      const file = join(altered, "finite-current.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect finite pump first sample of finite-current" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const retry = await launch();
    try {
      const page = await retry.firstWindow();
      await expect(page.getByTestId("rice-mele-finite-pump-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await retry.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-rice-finite-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("Rice–Mele pump shows exact supplied bands, Berry phase and polarization after restart", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-rice-pump-"));
  const result = JSON.parse(await readFile(resultFile, "utf8"));
  const launch = () => launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd: repo,
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    for (let opening = 0; opening < 2; opening++) {
      const app = await launch();
      try {
        const page = await app.firstWindow();
        const profile = page.getByTestId("rice-mele-pump-profile");
        await expect(profile).toContainText("verified filled-band pump cycle");
        await expect(profile).toContainText("Occupied-band Chern: -1");
        await expect(profile).toContainText("Polarization winding: -1");
        await expect(profile).toContainText("Finite-speed current and finite-chain edge motion are not supplied");
        await page.getByRole("button", { name: "Inspect pump first sample of band-0", exact: true }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.analysis.lowerBand[0].toPrecision(10));
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.runId);
        await page.getByRole("button", { name: "Inspect pump first sample of polarization-samples", exact: true }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.analysis.polarization[0].toPrecision(10));
        await page.getByRole("button", { name: "Inspect first pump plaquette phase" }).click();
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.analysis.berryFlux[0].toPrecision(10));
        await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.runId);
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-rice-pump-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("Rice–Mele pump refuses changed source bytes on selection and reopening", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-rice-pump-"));
  const altered = join(root, "altered.qscene");
  try {
    await cp(fixture, altered, { recursive: true });
    const launch = () => launchRepoElectron({ args: [".", "--quantum-scene", altered], cwd: repo,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    const app = await launch();
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("rice-mele-pump-profile")).toBeVisible();
      const file = join(altered, "band-energy-0.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect pump first sample of band-0", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
    const retry = await launch();
    try {
      const page = await retry.firstWindow();
      await expect(page.getByTestId("rice-mele-pump-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await retry.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-rice-pump-")) throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
