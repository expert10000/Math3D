import { expect, test } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("Lab QWZ study handoff stages both exact scenes in a new Math3D Project", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi08-ui-"));
  const handoff = join(root, "study");
  const runId = "run-05ce1036d70c466eb4f900944a85c474";
  const names = [`${runId}.qscene`, `${runId}-bands.qscene`];
  const fixtures = resolve(__dirname, "..", "fixtures", "quantum-qi01");
  await mkdir(handoff);
  await Promise.all(names.map(name => cp(join(fixtures, name), join(handoff, name), { recursive: true })));
  const scenes = await Promise.all(names.map(async (name, index) => {
    const scene = JSON.parse(await readFile(join(handoff, name, "scene.json"), "utf8"));
    return { role: index ? "bands" : "curvature", folder: name, sceneId: scene.id,
      resultSha256: scene.provenance.resultSha256 };
  }));
  expect(scenes[0].resultSha256).toBe(scenes[1].resultSha256);
  const manifest = { schema: "quantum-study-handoff/v1", model: "qwz", runId,
    resultSha256: scenes[0].resultSha256, scenes: scenes.map(({ role, folder, sceneId }) => ({ role, folder, sceneId })) };
  await writeFile(join(handoff, "study.json"), JSON.stringify(manifest));
  const app = await launchRepoElectron({ args: [".", "--quantum-study", handoff, "new"],
    cwd: resolve(__dirname, "..", ".."), env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const projects = page.getByTestId("project-explorer-panel");
    await expect(projects.getByTestId("project-quantum-study-handoff")).toBeVisible({ timeout: 60_000 });
    await projects.getByTestId("project-open-study-new").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Both exact QWZ views staged", { timeout: 60_000 });
    await projects.locator('[data-testid^="quantum-study-template-"]').first().click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("layout staged");
    const studies = projects.getByTestId("project-studies-panel");
    if (await projects.getByRole("heading", { name: "Quick Projects" }).count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    if (!await studies.count()) await projects.getByTestId("project-detail-toggle").click();
    await expect(studies).toBeVisible();
    await studies.locator('[data-testid^="project-study-create-qwz-"]').click();
    await expect(projects.getByTestId("project-message")).toContainText("Four-view QWZ Study staged", { timeout: 60_000 });
    await studies.locator('[data-testid^="project-study-open-"]').click();
    await expect(studies.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "quad");
    await studies.getByTestId("project-study-preview-toggle-curvature").click();
    await expect(studies.getByTestId("project-study-quantum-view")).toHaveAttribute("data-role", "curvature", { timeout: 60_000 });
    await studies.getByTestId("project-study-preview-toggle-bands").click();
    await expect(studies.getByTestId("project-study-quantum-view")).toHaveAttribute("data-role", "bands", { timeout: 60_000 });
    await expect(studies.getByTestId("project-study-quantum-view")).toHaveCount(1);
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1") || "null")?.workspace.entries
      .filter((entry: { module: string }) => entry.module === "quantum").length ?? 0), { timeout: 60_000 }).toBe(2);
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.quantumScenes).toHaveLength(2);
    expect(project.workspace.quantumStudies).toHaveLength(1);
    expect(project.workspace.quantumStudies[0].templateId).toBe("qwz");
    expect(project.workspace.quantumStudies[0].panels.map((panel: { role: string }) => panel.role)).toEqual(["curvature", "bands"]);
    expect(project.workspace.studies[0].layout.mode).toBe("quad");
    expect(project.workspace.entries.filter((entry: { module: string }) => entry.module === "quantum")
      .every((entry: { checkpoint: { linkedViews?: unknown[] } }) => entry.checkpoint.linkedViews?.length === 1)).toBe(true);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi08-ui-")) throw new Error("Unsafe QI-08 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
