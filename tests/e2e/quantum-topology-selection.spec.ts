import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("QWZ curvature and supplied vectors retain exact sample identity through Project restart and refuse tampering", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q07-topology-"));
  const source = resolve(__dirname, "..", "fixtures", "quantum-scene",
    "run-97a132d1d712414bb62bb8c9212f517e.qscene");
  const qwz = join(root, "qwz.qscene");
  await cp(source, qwz, { recursive: true });
  const launch = (args: string[] = ["."]) => launchRepoElectron({ args, cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  let app = await launch([".", "--quantum-scene", qwz]);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    const panel = page.getByTestId("quantum-topology-inspector");
    await expect(panel).toContainText("Lower-band Berry curvature");
    await expect(panel).toContainText("Blue: negative");
    await expect(panel).toContainText("red: positive");
    await expect(panel).toContainText("Per-sample singular/undefined masks are not part of this scene contract");
    const canvas = page.getByTestId("quantum-scene-geometry").locator("canvas").first();
    const bounds = (await canvas.boundingBox())!;
    let pickedCurvature = false;
    for (const x of [.3, .45, .6, .7]) {
      for (const y of [.25, .4, .55, .7]) {
        await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
        if (await page.getByTestId("quantum-topology-selection").count()) { pickedCurvature = true; break; }
      }
      if (pickedCurvature) break;
    }
    expect(pickedCurvature).toBe(true);
    await expect(page.getByTestId("quantum-topology-selection")).toContainText("dataset index:");
    await page.getByRole("button", { name: "Inspect first topology sample lower-curvature" }).click();
    await expect(page.getByTestId("quantum-topology-selection")).toContainText("berry-curvature:sample:0");
    await expect(page.getByTestId("quantum-topology-selection")).toContainText("dimensionless (a=1)");
    const fingerprint = (await page.evaluate(() => (window as any).quantumScenes.reopenRecent())).reference.sceneFingerprint;
    const exact = await page.evaluate(async fingerprint => (window as any).quantumScenes.topologySample({
      fingerprint, quantityId: "lower-curvature", sampleIndex: 220,
    }), fingerprint);
    expect(exact).toMatchObject({ objectId: "berry-curvature", sampleIndex: 220,
      sampleId: "berry-curvature:sample:220", valueDatasetId: "curvature" });
    expect(Number.isFinite(exact.value)).toBe(true);
    await page.getByRole("button", { name: "Inspect first vector sample reciprocal-b1" }).click();
    await expect(page.getByTestId("quantum-vector-selection")).toContainText("reciprocal-b1:sample:0");
    await expect(page.getByTestId("quantum-vector-selection")).toContainText("rad / lattice constant");
    const vector = await page.evaluate(async fingerprint => (window as any).quantumScenes.vectorSample({
      fingerprint, objectId: "reciprocal-b2", sampleIndex: 0,
    }), fingerprint);
    expect(vector.value).toEqual([0, 2 * Math.PI, 0]);
    await page.getByLabel("Vector glyph density").selectOption("16");
    await expect(page.getByTestId("quantum-vector-reciprocal-b1")).toContainText("1 of 1 source samples shown");
    await page.getByTestId("quantum-scene-close").click();

    if (!(await page.getByTestId("project-explorer-panel").isVisible())) await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const reference = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId(`project-open-quantum-scene-${reference.sceneFingerprint}`)
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByTestId("quantum-topology-inspector")).toBeVisible();
    await page.getByRole("button", { name: "Inspect first topology sample lower-curvature" }).click();
    await expect(page.getByTestId("quantum-topology-selection")).toContainText("berry-curvature:sample:0");
    const curvature = Buffer.from(await readFile(join(qwz, "curvature.f64")));
    curvature[0] ^= 1;
    await writeFile(join(qwz, "curvature.f64"), curvature);
    await page.getByRole("button", { name: "Inspect first vector sample reciprocal-b1" }).click();
    await expect(page.getByTestId("quantum-topology-inspector").getByRole("alert"))
      .toContainText(/Vector selection refused:.*(integrity|hash|size)/i);
    await expect(page.getByTestId("quantum-vector-selection")).toHaveCount(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q07-topology-"))
      throw new Error("Unsafe Q07 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
