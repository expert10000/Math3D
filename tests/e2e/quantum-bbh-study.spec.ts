import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene",
  "run-4fb258a3692f40479c097181ca9d779a-bbh-finite.qscene");

test("BBH producer examples inspect exact bands and finite cell density without invariant claims", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-bbh-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const examples = async () => {
      await page.getByRole("button", { name: "Palette", exact: true }).click();
      await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
      await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    };
    await examples();
    await page.getByTestId("quantum-example-bbh-bands").click();
    await expect(page.getByTestId("bbh-study-profile")).toContainText("four stored energy surfaces");
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("Stored datasets");
    await page.getByTestId("quantum-scene-close").click();
    await examples();
    await page.getByTestId("quantum-example-bbh-finite").click();
    await expect(page.getByTestId("bbh-study-profile")).toContainText("finite-system observation");
    await expect(page.getByTestId("bbh-study-profile")).toContainText("No quadrupole invariant");
    await page.getByRole("button", { name: "Inspect first sample of finite-midgap-cells" }).click();
    await expect(page.getByTestId("quantum-scalar-selection")).toContainText("midgap-density");
    await expect(page.getByTestId("quantum-scalar-selection")).toContainText("probability per cell");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-bbh-")) throw new Error("Unsafe BBH cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("changed finite BBH density bytes are refused on open", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-bbh-"));
  try {
    const altered = join(root, "altered.qscene");
    await cp(fixture, altered, { recursive: true });
    const file = join(altered, "midgap-density.f64"), bytes = await readFile(file);
    bytes[0] ^= 1; await writeFile(file, bytes);
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", altered],
      cwd: resolve(__dirname, "..", ".."), env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("bbh-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await app.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-bbh-")) throw new Error("Unsafe BBH cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("finite BBH sample inspection refuses a source changed after opening", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-bbh-"));
  try {
    const source = join(root, "changed-later.qscene");
    await cp(fixture, source, { recursive: true });
    const app = await launchRepoElectron({ args: [".", "--quantum-scene", source],
      cwd: resolve(__dirname, "..", ".."), env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("bbh-study-profile")).toBeVisible();
      const file = join(source, "midgap-density.f64"), bytes = await readFile(file);
      bytes[0] ^= 1; await writeFile(file, bytes);
      await page.getByRole("button", { name: "Inspect first sample of finite-midgap-cells" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-bbh-")) throw new Error("Unsafe BBH cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
