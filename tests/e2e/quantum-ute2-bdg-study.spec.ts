import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

for (const scenario of [
  { name: "reduced", fixture: "ute2-bdg-826c7f692ef5569b4d169a6a.qscene", template: "ute2-bdg",
    changed: "positive-positions.f64", value: "spectrum", nodeText: '"sampledNode":true' },
  { name: "lattice", fixture: "ute2-lattice-9838f91e539472e71ee9655b.qscene", template: "ute2-lattice",
    changed: "node-mask-scalars.f64", value: "energy", nodeText: '"sampledNode":true' },
] as const) test(`Theory Lab ${scenario.name} BdG scene saves and reopens a masked Math3D Study`, async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), `m3d-ute2-${scenario.name}-study-`));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-ute2", scenario.fixture);
  const source = join(root, "source.qscene"), profile = join(root, "profile");
  await cp(fixture, source, { recursive: true });
  const launch = () => launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const fingerprint = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0].sceneFingerprint as string);
    await projects.getByTestId(`project-admit-quantum-scene-${fingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("staged in Project contents");
    await projects.getByTestId("project-save").click();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
      .filter((item: { module: string }) => item.module === "quantum").length), { timeout: 60_000 }).toBe(1);
    await projects.getByTestId(`quantum-study-template-${fingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("layout staged");
    await projects.getByTestId("project-save").click();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.quantumStudies?.[0]?.templateId),
      { timeout: 60_000 }).toBe(scenario.template);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.studies[0].members).toHaveLength(1);
    expect(saved.workspace.quantumStudies[0].panels).toHaveLength(scenario.name === "lattice" ? 3 : 1);
    const studyId = saved.workspace.studies[0].id as string;
    if (!await projects.getByTestId("project-research-nav-studies").count())
      await projects.getByTestId("project-gallery-layout-toggle").first().click();
    if (!await projects.getByTestId("project-studies-panel").count()) await projects.getByTestId("project-detail-toggle").click();
    await projects.getByRole("button", { name: "Studies", exact: true }).click();
    await projects.getByTestId(`project-study-open-${studyId}`).click();
    await expect(projects.getByTestId("project-study-quantum-selection")).toBeVisible();
    if (scenario.name === "reduced") {
      await projects.getByTestId("project-study-bdg-index").fill("25");
      await projects.getByTestId("project-study-pin-bdg").click();
    } else {
      await projects.getByTestId("project-study-lattice-kx-index").fill("0");
      await projects.getByTestId("project-study-lattice-ky-index").fill("8");
      await projects.getByTestId("project-study-pin-lattice").click();
    }
    await expect(projects.getByTestId(`project-study-value-${scenario.value}`)).toContainText(scenario.nodeText, { timeout: 60_000 });
    if (scenario.name === "lattice") {
      await expect(projects.getByTestId("project-study-value-gap")).toBeVisible();
      await expect(projects.getByTestId("project-study-value-pairing")).toContainText('"phaseRad":null');
    } else await expect(projects.getByTestId("project-study-value-spectrum")).toContainText('"electronWeight":null');
    await projects.getByTestId("project-save").click();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.quantumStudies[0].panels[0].sampleIndex),
      { timeout: 60_000 }).toBe(scenario.name === "lattice" ? 8 : 25);
    const id = saved.identity.id as string;
    await app.close();
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${id}`).click();
    if (!await projects.getByTestId("project-research-nav-studies").count())
      await projects.getByTestId("project-gallery-layout-toggle").first().click();
    await projects.getByRole("button", { name: "Studies", exact: true }).click();
    await projects.getByTestId(`project-study-open-${studyId}`).click();
    await expect(projects.getByTestId(`project-study-value-${scenario.value}`)).toContainText(scenario.nodeText, { timeout: 60_000 });
    const file = join(source, scenario.changed), bytes = await readFile(file);
    bytes[0] ^= 1; await writeFile(file, bytes);
    await projects.getByTestId("project-study-export-quantum-evidence").click();
    await expect(projects.getByTestId("project-study-quantum-withheld")).toBeVisible({ timeout: 60_000 });
    await expect(projects.getByTestId("project-study-evidence-omission")).toContainText(/verification failed|integrity|changed/i);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes(`m3d-ute2-${scenario.name}-study-`))
      throw new Error("Unsafe UTe2 BdG cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
