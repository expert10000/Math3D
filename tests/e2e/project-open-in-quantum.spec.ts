import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("verified Quantum polyline opens as a saved Graph with exact source return", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-open-in-quantum-"));
  const scene = resolve(__dirname, "..", "fixtures", "quantum-qi01",
    "run-05ce1036d70c466eb4f900944a85c474.qscene");
  const app = await launchRepoElectron({ args: [".", "--quantum-scene", scene],
    cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const fingerprint = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0].sceneFingerprint as string);
    await projects.getByTestId(`project-admit-quantum-scene-${fingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("staged in Project contents");
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
      .some((item: { module: string }) => item.module === "quantum")), { timeout: 60_000 }).toBe(true);
    const admitted = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await projects.getByTestId(`project-open-saved-${admitted.identity.id}`).click();
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-tab-documents").click();
    const quantumId = admitted.workspace.entries.find((item: { module: string }) => item.module === "quantum").expected.id as string;
    const quantumMenu = projects.getByTestId(`project-open-in-${quantumId}`);
    await expect(quantumMenu).toBeVisible();
    await quantumMenu.locator("summary").click();
    const action = quantumMenu.getByRole("button", { name: "Open in Graphs" });
    await expect(action).toBeEnabled();
    await action.click();
    await expect(projects.getByTestId("project-message")).toContainText("source-linked Quantum Graph", { timeout: 60_000 });
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved “", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const relation = saved.workspace.relations.find((item: { operation: string }) =>
      item.operation === "quantum.promote-graph2d");
    expect(relation).toBeTruthy();
    expect(relation.sources[0].documentId).toBe(quantumId);
    const targetId = relation.target.generation.documentId;
    expect(saved.workspace.entries.find((item: { expected: { id: string } }) =>
      item.expected.id === targetId).module).toBe("graph2d");
    await projects.getByTestId("project-detail-tab-documents").click();
    const returnButton = projects.getByTestId(`project-open-in-return-${targetId}`)
      .getByRole("button", { name: "Return to source Quantum scene" });
    await expect(returnButton).toBeEnabled();
    await returnButton.click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", quantumId);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-open-in-quantum-"))
      throw new Error("Unsafe Quantum test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
