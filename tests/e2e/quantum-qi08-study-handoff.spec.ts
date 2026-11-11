import { expect, test } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("Lab QWZ study handoff stages both exact scenes in a new Math3D Project", async () => {
  test.setTimeout(240_000);
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
  let app = await launchRepoElectron({ args: [".", "--quantum-study", handoff, "new"],
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
    await studies.getByTestId("project-study-preview-toggle-reciprocal").click();
    await expect(studies.getByTestId("project-study-quantum-view")).toHaveAttribute("data-role", "reciprocal", { timeout: 60_000 });
    await studies.getByLabel("Band sample index").fill("0");
    await studies.getByTestId("project-study-share-qwz-k").click();
    await expect(studies.getByTestId("project-study-qwz-cursor-status")).toContainText("Berry curvature", { timeout: 60_000 });
    await studies.getByTestId("project-study-pin-qwz-k").click();
    await expect(studies.getByTestId("project-study-qwz-pin-status")).toContainText("Pinned band sample 0");
    await studies.getByLabel("Band sample index").fill("1");
    await studies.getByTestId("project-study-share-qwz-k").click();
    await expect(studies.getByTestId("project-study-pin-qwz-k")).toHaveText("Update pinned k", { timeout: 60_000 });
    await studies.getByTestId("project-study-pin-qwz-k").click();
    await expect(studies.getByTestId("project-study-qwz-pin-status")).toContainText("Pinned band sample 1");
    await studies.getByTestId("project-study-unpin-qwz-k").click();
    await expect(studies.getByTestId("project-study-qwz-pin-status")).toHaveCount(0);
    await studies.getByLabel("Band sample index").fill("0");
    await studies.getByTestId("project-study-share-qwz-k").click();
    await expect(studies.getByTestId("project-study-pin-qwz-k")).toBeVisible({ timeout: 60_000 });
    await studies.getByTestId("project-study-pin-qwz-k").click();
    await expect(studies.getByTestId("project-study-qwz-pin-status")).toContainText("Pinned band sample 0");
    await expect(studies.getByTestId("project-study-quantum-linked-k")).toContainText("Linked k=");
    await studies.getByTestId("project-study-derive-qwz-profile").click();
    await expect(studies.getByTestId("project-study-qwz-profile-status"))
      .toContainText("Saved band profile in Graph", { timeout: 60_000 });
    await expect(studies.getByTestId("project-study-qwz-saved-profile"))
      .toContainText("producer samples");
    await studies.getByTestId("project-study-qwz-path-indices").fill("0,1,2");
    await studies.getByTestId("project-study-publish-qwz-path").click();
    await expect(studies.getByTestId("project-study-qwz-profile-status"))
      .toContainText("Authored reciprocal path saved in Graph", { timeout: 60_000 });
    await expect(studies.getByTestId("project-study-qwz-saved-profile"))
      .toContainText("authored-sample-path");
    await studies.getByTestId("project-study-preview-toggle-inspector").click();
    await expect(studies.getByTestId("project-study-qwz-inspector")).toContainText("Chern number: -1", { timeout: 60_000 });
    await expect(studies.getByTestId("project-study-quantum-linked-k")).toContainText("Linked k=");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const savedAfterProfile = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(savedAfterProfile.workspace.studies[0].pinnedSelectionIds).toHaveLength(1);
    if (!await studies.getByTestId("project-study-note-on-pin").count())
      await studies.locator('[data-testid^="project-study-open-"]').click();
    await studies.getByTestId("project-study-note-on-pin").click();
    const notes = projects.getByTestId("project-notes-panel");
    await expect(notes).toBeVisible();
    await expect(notes.locator('[data-testid^="note-draft-"]')).toContainText("study · Session draft");
    await notes.getByTestId("notes-save").click();
    await expect(notes.getByTestId("notes-message")).toContainText("Saved 1 Note", { timeout: 60_000 });
    await expect(notes.getByText("Pinned k observation")).toBeVisible();
    await notes.getByRole("button", { name: "Back to Project" }).click();
    if (!await studies.getByTestId("project-study-view").count())
      await studies.locator('[data-testid^="project-study-open-"]').click();
    await expect(studies.getByTestId("project-study-note-references")).toContainText("Pinned k observation");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1") || "null")?.workspace.entries
      .filter((entry: { module: string }) => entry.module === "quantum").length ?? 0), { timeout: 60_000 }).toBe(2);
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.quantumScenes).toHaveLength(2);
    expect(project.workspace.quantumStudies).toHaveLength(1);
    expect(project.workspace.quantumStudies[0].templateId).toBe("qwz");
    expect(project.workspace.quantumStudies[0].panels.map((panel: { role: string }) => panel.role)).toEqual(["curvature", "bands"]);
    expect(project.workspace.studies[0].layout.mode).toBe("quad");
    expect(project.notes).toHaveLength(1);
    expect(project.notes[0].anchor).toMatchObject({ kind: "study-selection",
      studyId: project.workspace.studies[0].id, memberId: "bands" });
    expect(project.workspace.entries.filter((entry: { module: string }) => entry.module === "quantum")
      .every((entry: { checkpoint: { linkedViews?: unknown[] } }) => entry.checkpoint.linkedViews?.length === 1)).toBe(true);
    const profile = [...project.workspace.results].reverse().find((result: { provenance: { operation: { type: string } } }) =>
      result.provenance.operation.type === "quantum.qwz-band-profile");
    expect(profile).toBeTruthy();
    expect(profile.summary.rowCount).toBeGreaterThan(1);
    expect(profile.summary.pathType).toBe("authored-sample-path");
    expect(profile.provenance.operation.parameters.pathIndices).toEqual([0, 1, 2]);
    const tableId = profile.provenance.operation.parameters.tableId;
    const tableContents = await page.evaluate(() => Object.fromEntries(
      Object.keys(localStorage).filter(key => key.startsWith("math3d.graph2d.table."))
        .map(key => [key.slice("math3d.graph2d.table.".length), localStorage.getItem(key)])));
    expect(tableContents[tableId]).toBeTruthy();
    const portable = require(resolve("renderer/src/projects/projectResources.ts"));
    const verifiedResources = portable.captureProjectResources(project, (item: { kind: string; id: string }) =>
      item.kind === "graph-point-table" && tableContents[item.id] ? Buffer.from(tableContents[item.id]!) : null, true);
    const packageJson = portable.exportProjectPackage(project, verifiedResources);
    const imported = portable.parseProjectPackage(packageJson);
    expect(imported.project.workspace.results.some((item: { resultId: string }) => item.resultId === profile.resultId)).toBe(true);
    expect(imported.resources.bytes({ kind: "graph-point-table", id: tableId })).toBeTruthy();
    const missingSidecar = JSON.parse(packageJson);
    missingSidecar.resources = missingSidecar.resources.filter((item: { id: string }) => item.id !== tableId);
    expect(portable.parseProjectPackage(JSON.stringify(missingSidecar)).resources
      .bytes({ kind: "graph-point-table", id: tableId })).toBeNull();
    expect(project.workspace.entries.some((entry: { module: string; expected: { id: string } }) =>
      entry.module === "graph2d" && entry.expected.id === profile.provenance.operation.parameters.graphDocumentId)).toBe(true);
    await app.close();
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile"),
        QLAB_PYTHON: join(root, "missing-worker") } });
    const reopenedPage = await app.firstWindow();
    await reopenedPage.getByTestId("projects-toggle").click();
    const reopenedProjects = reopenedPage.getByTestId("project-explorer-panel");
    await reopenedProjects.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await expect(reopenedProjects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const reopenedStudies = reopenedProjects.getByTestId("project-studies-panel");
    if (!await reopenedStudies.count()) await reopenedProjects.getByTestId("project-gallery-layout-toggle").first().click();
    if (!await reopenedStudies.count() && await reopenedProjects.getByTestId("project-detail-toggle").count())
      await reopenedProjects.getByTestId("project-detail-toggle").click();
    if (await reopenedProjects.getByTestId("project-detail-tab-overview").count())
      await reopenedProjects.getByTestId("project-detail-tab-overview").click();
    await expect(reopenedStudies).toBeVisible();
    await reopenedStudies.locator('[data-testid^="project-study-open-"]').click();
    await expect(reopenedStudies.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "quad");
    await expect(reopenedStudies.getByTestId("project-study-qwz-pin-status")).toContainText("Pinned band sample 0");
    await expect(reopenedStudies.getByTestId("project-study-note-references")).toContainText("Pinned k observation · current");
    await reopenedStudies.getByTestId("project-study-note-references").getByRole("button", { name: "Open Note" }).click();
    const reopenedNotes = reopenedProjects.getByTestId("project-notes-panel");
    await expect(reopenedNotes.getByText("Pinned k observation")).toBeVisible();
    await expect(reopenedNotes.getByText(/Study .*selection qwz:band-0:/)).toBeVisible();
    await reopenedNotes.getByRole("button", { name: "Back to Project" }).click();
    if (!await reopenedStudies.getByTestId("project-study-view").count())
      await reopenedStudies.locator('[data-testid^="project-study-open-"]').click();
    await expect(reopenedStudies.getByTestId("project-study-qwz-cursor-status")).toContainText("Berry curvature", { timeout: 60_000 });
    const exportEvidence = async (name: string) => {
      const target = join(root, name);
      await app.evaluate(({ session }, path) => session.defaultSession.once("will-download",
        (_event, item) => item.setSavePath(path)), target);
      await reopenedStudies.getByTestId("project-study-export-qwz-evidence").click();
      await expect.poll(async () => {
        try { return JSON.parse(await readFile(target, "utf8")); } catch { return null; }
      }, { timeout: 60_000 }).not.toBeNull();
      return JSON.parse(await readFile(target, "utf8"));
    };
    const verifiedEvidence = await exportEvidence("qwz-verified-evidence.json");
    expect(verifiedEvidence.schema).toBe("math3d.qwz-study-evidence/v1");
    expect(verifiedEvidence.source.resultSha256).toBe(scenes[0].resultSha256);
    expect(verifiedEvidence.verification).toMatchObject({ status: "verified", omissions: [],
      selection: { band: { sampleIndex: 0 }, curvature: { sampleIndex: expect.any(Number) },
        projection: { strategy: "nearest-lowest-index" } } });
    expect(verifiedEvidence.profile).toMatchObject({ status: "saved", rowCount: profile.summary.rowCount,
      resultId: profile.resultId });
    await reopenedStudies.getByTestId("project-study-open-source-curvature").click();
    await expect(reopenedPage.getByTestId("quantum-scene-preview")).toBeVisible({ timeout: 60_000 });
    await reopenedPage.getByTestId("quantum-scene-close").click();
    await expect(reopenedPage.getByTestId("quantum-scene-preview")).toHaveCount(0);
    await expect(reopenedStudies.getByTestId("project-study-view")).toHaveAttribute("data-study-id", project.workspace.studies[0].id);
    await expect(reopenedStudies.getByTestId("project-study-qwz-pin-status")).toContainText("Pinned band sample 0");
    await reopenedStudies.getByTestId("project-study-preview-toggle-curvature").click();
    await expect(reopenedStudies.getByTestId("project-study-quantum-view")).toHaveAttribute("data-role", "curvature", { timeout: 60_000 });
    await expect(reopenedStudies.getByTestId("project-study-quantum-linked-k")).toContainText("Linked k=");
    const blob = join(handoff, names[0], "curvature.f64"), original = await readFile(blob);
    const changed = Buffer.from(original); changed[0] ^= 1; await writeFile(blob, changed);
    await reopenedStudies.getByTestId("project-study-open-source-curvature").click();
    await expect(reopenedProjects.getByTestId("project-quantum-scene-message")).toContainText("Scene unavailable", { timeout: 60_000 });
    await expect(reopenedPage.getByTestId("quantum-scene-preview")).toHaveCount(0);
    await reopenedStudies.getByTestId("project-study-preview-toggle-curvature").click();
    await reopenedStudies.getByTestId("project-study-preview-toggle-curvature").click();
    await expect(reopenedStudies.getByTestId("project-study-quantum-withheld")).toContainText(/changed|hash|checksum|integrity/i, { timeout: 60_000 });
    await reopenedStudies.getByTestId("project-study-share-qwz-k").click();
    await expect(reopenedStudies.getByTestId("project-study-qwz-cursor-status")).toContainText("withheld", { timeout: 60_000 });
    await expect(reopenedStudies.getByTestId("project-study-qwz-pin-status")).toContainText("Pinned band sample 0");
    await expect(reopenedStudies.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "quad");
    const withheldEvidence = await exportEvidence("qwz-withheld-evidence.json");
    expect(withheldEvidence.source).toEqual(verifiedEvidence.source);
    expect(withheldEvidence.verification).toMatchObject({ status: "withheld", selection: null,
      invariants: null, omissions: ["band energy", "Berry curvature", "reciprocal projection", "topology invariants"] });
    expect(withheldEvidence.profile).toMatchObject({ resultId: profile.resultId,
      status: "withheld" });
    await writeFile(blob, original);
    const missingBand = join(handoff, names[1], "band-energy-0.f64");
    const bandBytes = await readFile(missingBand);
    await rm(missingBand);
    const missingEvidence = await exportEvidence("qwz-missing-band-evidence.json");
    expect(missingEvidence.verification).toMatchObject({ status: "withheld", selection: null });
    expect(missingEvidence.profile).toMatchObject({ status: "withheld", resultId: profile.resultId });
    await writeFile(missingBand, bandBytes);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi08-ui-")) throw new Error("Unsafe QI-08 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
