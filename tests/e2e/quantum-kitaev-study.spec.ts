import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const repo = resolve(__dirname, "..", "..");
const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene",
  "run-18145016435540afafc5a2a06870566f-kitaev-finite.qscene");
const resultFile = resolve(__dirname, "..", "fixtures", "quantum-scene", "kitaev-producer-result.json");

async function openExamples(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Verified quantum examples");
  await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
}

test("Kitaev producer examples inspect exact samples and reopen after restart without invariant claims", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-kitaev-"));
  const profile = join(root, "profile");
  const launch = () => launchRepoElectron({ args: ["."], cwd: repo,
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
  const result = JSON.parse(await readFile(resultFile, "utf8"));
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await openExamples(page);
    await page.getByTestId("quantum-example-kitaev-bands").click();
    await expect(page.getByTestId("kitaev-study-profile")).toContainText("periodic BdG bands");
    await expect(page.getByTestId("kitaev-study-profile"))
      .toContainText(/no winding, Z₂ invariant/i);
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection"))
      .toContainText(result.analysis.lowerBand[0].toPrecision(8));
    await expect(page.getByTestId("quantum-band-selection")).toContainText(result.runId);
    await page.getByTestId("quantum-scene-close").click();

    await openExamples(page);
    await page.getByTestId("quantum-example-kitaev-finite").click();
    await expect(page.getByTestId("kitaev-study-profile")).toContainText("finite open-chain end density");
    await expect(page.getByTestId("kitaev-study-profile")).toContainText("finite-chain observation");
    await page.getByRole("button", { name: "Inspect first sample of finite-end-sites" }).click();
    await expect(page.getByTestId("quantum-scalar-selection"))
      .toContainText(result.analysis.finite.siteDensity[0].toPrecision(10));
    await expect(page.getByTestId("quantum-scalar-selection")).toContainText(result.runId);

    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect.poll(() => page.evaluate(() => typeof (window as any).quantumScenes?.reopenRecent))
      .toBe("function");
    const reopened = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(reopened).toMatchObject({ ok: true, remembered: true });
    if (!reopened.ok) throw new Error("Pinned finite Kitaev scene did not reopen");
    expect(reopened.document.metadata.sourceModel).toBe("kitaev_chain");
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Reopen recent quantum scene");
    await page.getByRole("button", { name: "Reopen recent quantum scene", exact: true }).click();
    await expect(page.getByTestId("kitaev-study-profile")).toBeVisible();
    await page.getByRole("button", { name: "Inspect first sample of finite-end-sites" }).click();
    await expect(page.getByTestId("quantum-scalar-selection"))
      .toContainText(result.analysis.finite.siteDensity[0].toPrecision(10));
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-kitaev-"))
      throw new Error("Unsafe Kitaev cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("changed Kitaev density bytes are refused on open and on exact inspection", async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-kitaev-"));
  try {
    const altered = join(root, "altered.qscene");
    await cp(fixture, altered, { recursive: true });
    const densityFile = join(altered, "near-zero-density.f64");
    const launch = () => launchRepoElectron({ args: [".", "--quantum-scene", altered],
      cwd: repo, env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
    let app = await launch();
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("kitaev-study-profile")).toBeVisible();
      const changed = Buffer.from(await readFile(densityFile));
      changed[0] ^= 1;
      await writeFile(densityFile, changed);
      await page.getByRole("button", { name: "Inspect first sample of finite-end-sites" }).click();
      await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash/i);
      await expect(page.getByTestId("quantum-scalar-selection")).toHaveCount(0);
    } finally { await app.close(); }
    app = await launch();
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("kitaev-study-profile")).toHaveCount(0);
      await expect(page.getByText(/integrity|hash|invalid scene/i).first()).toBeVisible();
    } finally { await app.close(); }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-kitaev-"))
      throw new Error("Unsafe Kitaev cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
