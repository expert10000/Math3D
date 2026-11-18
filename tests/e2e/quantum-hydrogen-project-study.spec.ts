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
    await projects.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(projects.getByTestId("project-study-hydrogen-view")).toHaveAttribute("data-role", "density");
    await expect(projects.getByTestId("quantum-field-legend")).toContainText("a0^-3", { timeout: 60_000 });
    const canvas = projects.getByTestId("quantum-field-canvas");
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(projects.getByTestId("project-study-evidence-omission"))
      .toContainText("Phase is undefined", { timeout: 60_000 });
    await projects.getByTestId("quantum-field-canvas").click({ position: { x: 150, y: 150 } });
    await expect(projects.getByTestId("project-study-value-density")).toContainText("a0^-3", { timeout: 60_000 });
    await expect(projects.getByTestId("project-study-value-phase")).toContainText("rad", { timeout: 60_000 });
    await projects.getByTestId("project-study-preview-toggle-pane-1").click();
    await projects.getByTestId("project-study-preview-toggle-pane-2").click();
    await expect(projects.getByTestId("project-study-hydrogen-view")).toHaveAttribute("data-role", "phase");
    await expect(projects.getByTestId("project-study-hydrogen-view")).toContainText("undefined at complex nodes");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.quantumStudies[0].templateId).toBe("hydrogen");
    expect(saved.workspace.quantumStudies[0].panels.map((item: { role: string }) => item.role)).toEqual(["density", "phase"]);
    expect(saved.workspace.quantumStudies[0].panels[0].sampleIndex).toEqual(saved.workspace.quantumStudies[0].panels[1].sampleIndex);
    expect(saved.workspace.quantumStudies[0].panels[0].sampleIndex).not.toBeNull();
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
    await reopenedProjects.getByTestId("project-gallery-layout-toggle").click();
    await reopenedProjects.getByTestId("project-research-nav-studies").click();
    await reopenedProjects.getByTestId(`project-study-open-${saved.workspace.studies[0].id}`).click();
    await expect(reopenedProjects.getByTestId("project-study-value-density")).toContainText("a0^-3", { timeout: 60_000 });
    await expect(reopenedProjects.getByTestId("project-study-value-phase")).toContainText("rad", { timeout: 60_000 });
    await reopenedProjects.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(reopenedProjects.getByTestId("project-study-hydrogen-view"))
      .toHaveAttribute("data-role", "density", { timeout: 60_000 });
    await expect(reopenedProjects.getByTestId("quantum-field-legend")).toContainText("a0^-3", { timeout: 60_000 });
    await expect(reopenedProjects.getByTestId("quantum-field-sample")).toContainText("density =", { timeout: 60_000 });
    await reopenedProjects.getByTestId("project-study-preview-toggle-pane-1").click();
    await reopenedProjects.getByTestId("project-study-preview-toggle-pane-2").click();
    await expect(reopenedProjects.getByTestId("project-study-hydrogen-view"))
      .toHaveAttribute("data-role", "phase", { timeout: 60_000 });
    await expect(reopenedProjects.getByTestId("quantum-field-legend")).toContainText("rad", { timeout: 60_000 });
    await expect(reopenedProjects.getByTestId("quantum-field-sample")).toContainText("phase =", { timeout: 60_000 });
    await reopenedProjects.getByTestId("project-study-preview-toggle-pane-2").click();
    await reopened.evaluate(() => {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        if (blob instanceof Blob)
          (window as Window & { __studyEvidence?: Promise<string> }).__studyEvidence = blob.text();
        return original(blob);
      };
    });
    await reopenedProjects.getByTestId("project-study-export-quantum-evidence").click();
    await expect.poll(() => reopened.evaluate(() =>
      Boolean((window as Window & { __studyEvidence?: Promise<string> }).__studyEvidence))).toBe(true);
    const validEvidence = JSON.parse(await reopened.evaluate(async () =>
      (window as Window & { __studyEvidence?: Promise<string> }).__studyEvidence!));
    expect(validEvidence.values.density.unit).toBe("a0^-3");
    expect(validEvidence.values.phase.unit).toBe("rad");
    expect(validEvidence.sources[0].datasets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "psi-real", unit: "a0^-3/2", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]));
    await reopened.evaluate(() => { (window as Window & { __studyEvidence?: Promise<string> }).__studyEvidence = undefined; });
    const binary = join(source, "psi-real.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    await reopenedProjects.getByTestId("project-study-export-quantum-evidence").click();
    await expect.poll(() => reopened.evaluate(() =>
      Boolean((window as Window & { __studyEvidence?: Promise<string> }).__studyEvidence))).toBe(true);
    const evidence = JSON.parse(await reopened.evaluate(async () =>
      (window as Window & { __studyEvidence?: Promise<string> }).__studyEvidence!));
    expect(evidence.values).toEqual({});
    expect(evidence.omissions.join(" ")).toMatch(/verification|integrity|hash|changed/i);
    await reopenedProjects.getByTestId("project-study-preview-toggle-pane-2").click();
    await expect(reopenedProjects.getByTestId("project-study-hydrogen-withheld"))
      .toContainText(/integrity|hash|changed/i, { timeout: 60_000 });
    await expect(reopenedProjects.getByTestId("quantum-field-legend")).toHaveCount(0);
    await app.close();
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
