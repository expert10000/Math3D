import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("guided hydrogen Study saves its exact complex field, cold-reopens, and refuses changed samples", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-hydrogen-study-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene-orbitals", "orbital-2p.qscene");
  const source = join(root, "orbital.qscene"), profile = join(root, "profile");
  await cp(fixture, source, { recursive: true });
  let app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
  try {
    const page = await app.firstWindow();
    await page.getByTestId("hydrogen-save-project-study").click({ timeout: 60_000 });
    const projects = page.getByTestId("project-explorer-panel");
    await expect(projects.getByTestId("project-hydrogen-study-request")).toBeInViewport();
    await projects.getByTestId("project-open-hydrogen-study-new").click();
    await expect(projects.getByTestId("project-quantum-scene-message"))
      .toContainText("Verified hydrogen scene and complex field staged", { timeout: 60_000 });
    await expect(projects.getByTestId("project-study-view")).toContainText("Hydrogen density and phase");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.quantumStudies[0].templateId).toBe("hydrogen");
    expect(saved.workspace.quantumStudies[0].panels.map((item: { role: string }) => item.role)).toEqual(["density", "phase"]);
    expect(saved.workspace.studies[0].members).toHaveLength(2);
    expect(saved.workspace.entries.map((item: { module: string }) => item.module).slice(-2)).toEqual(["quantum", "field"]);
    expect(saved.notes.filter((item: { title: string }) => item.title.startsWith("Hydrogen "))).toHaveLength(2);
    const id = saved.identity.id as string;
    await app.close();
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
    const reopened = await app.firstWindow();
    await reopened.getByTestId("projects-toggle").click();
    const reopenedProjects = reopened.getByTestId("project-explorer-panel");
    await reopenedProjects.getByTestId(`project-open-saved-${id}`).click();
    await expect(reopenedProjects.getByTestId("project-message"))
      .toContainText("Opened supported project", { timeout: 60_000 });
    const restored = await reopened.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(restored.workspace.quantumStudies[0].source).toEqual(saved.workspace.quantumStudies[0].source);
    expect(restored.workspace.studies[0].members).toEqual(saved.workspace.studies[0].members);
    await app.close();
    const binary = join(source, "psi-real.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
    const changed = await app.firstWindow();
    await changed.getByTestId("projects-toggle").click();
    const changedProjects = changed.getByTestId("project-explorer-panel");
    await changedProjects.getByTestId(`project-open-saved-${id}`).click();
    await expect(changedProjects.getByTestId("project-message"))
      .toContainText(/Project import failed:.*(integrity|hash|changed|verify)/i, { timeout: 60_000 });
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-hydrogen-study-"))
      throw new Error("Unsafe hydrogen Study cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
