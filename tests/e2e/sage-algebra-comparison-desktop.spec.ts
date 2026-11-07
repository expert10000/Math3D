import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const smith = require(resolve("tests/fixtures/sage-integer-matrix-forms-2-6-0.json"));

test("SAGE-H02 compares pinned backend and domain evidence after independent reopen", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-h02-surface", metadata: { title: "Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-h02-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-h02-desktop", title: "Algebra comparison" });
    const add = (key: string, kind: string) => {
      const record = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, key),
        revision: 1, label: key, definition: { kind } });
      project = core.upsertMath3DProjectAlgebraObject(project, record);
      return { objectId: record.id, revision: 1 };
    };
    const z = add("Z", "integer-ring"), q = add("Q", "rational-field");
    const save = (request: any, result: unknown, jobId: string, version = "10.10") => {
      const evidence = core.createProjectAlgebraEvidence(project.identity.id, project.algebraObjects, request, result,
        { engine: "sagemath", version, backend: request.backend, jobId, elapsedMs: 9, warnings: [] });
      project = core.addMath3DProjectAlgebraEvidence(project, evidence);
      return evidence;
    };
    const gcdDocker = save(core.buildAlgebraOperationRequest(project, z, "sage.numberTheory.gcd", "docker",
      { values: ["84", "30"] }), { value: "6" }, "h02desktopdocker");
    const gcdLocal = save(core.buildAlgebraOperationRequest(project, z, "sage.numberTheory.gcd", "private",
      { values: ["84", "30"] }), { value: "6" }, "h02desktoplocal", "9.5");
    const matrix = [["2", "0", "0"], ["0", "6", "0"], ["0", "0", "0"]];
    const qq = save(core.buildAlgebraOperationRequest(project, q, "sage.matrix.linear_dossier", "docker",
      { matrix }), { format: "math3d.sage-matrix-dossier-result", schemaVersion: 1, coefficientDomain: "QQ",
      sourceMatrix: matrix, inputShape: [3, 3], rank: 2,
      reducedRowEchelonForm: [["1", "0", "0"], ["0", "1", "0"], ["0", "0", "0"]],
      pivotColumns: [0, 1], kernelBasis: [["0", "0", "1"]],
      imageBasis: [["2", "0", "0"], ["0", "6", "0"]],
      minimalPolynomial: "t*(t-2)*(t-6)", characteristicPolynomial: "t*(t-2)*(t-6)" }, "h02desktopqq");
    const zz = save(core.buildAlgebraOperationRequest(project, z, "sage.matrix.integer_forms", "docker",
      { matrix }), smith, "h02desktopzz");
    const install = async (raw: string) => {
      await ctx!.page.evaluate(({ id, title, raw }) => {
        localStorage.setItem("math3d.project.v1", raw);
        localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
        localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
          entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
      }, { id: project.identity.id, title: project.metadata.title, raw });
      await ctx!.page.reload();
      await ctx!.page.getByTestId("projects-toggle").click();
      await ctx!.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
      await ctx!.page.getByTestId("workspace-nav-cas").click();
      await ctx!.page.getByTestId("cas-algebra-workspace").getByRole("button", { name: "Compare", exact: true }).click();
      return ctx!.page.getByTestId("cas-algebra-comparison");
    };
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    let comparison = await install(core.serializeMath3DProject(project));
    await comparison.getByLabel("Left comparison evidence").selectOption(gcdDocker.id);
    await comparison.getByLabel("Right comparison evidence").selectOption(gcdLocal.id);
    await expect(comparison.getByTestId("cas-comparison-verdict")).toContainText("Backend comparison · verified agreement");
    await expect(comparison).toContainText("Sage version10.10");
    await expect(comparison).toContainText("Sage version9.5");
    await comparison.getByLabel("Left comparison evidence").selectOption(qq.id);
    await comparison.getByLabel("Right comparison evidence").selectOption(zz.id);
    await expect(comparison.getByTestId("cas-comparison-verdict")).toContainText("Domain comparison · reported consistency");
    await expect(comparison).toContainText("Cokernel torsion2, 6");
    await expect(comparison.getByTestId("cas-comparison-checks")).toContainText("full QQ row equivalence is not independently certified");
    await ctx.page.getByTestId("cas-algebra-workspace").getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const bytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!bytes) throw new Error("Project save bytes are missing.");
    expect(core.parseMath3DProject(bytes).algebraEvidence).toHaveLength(4);
    await ctx.app.close();
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    comparison = await install(bytes);
    await comparison.getByLabel("Left comparison evidence").selectOption(gcdDocker.id);
    await comparison.getByLabel("Right comparison evidence").selectOption(gcdLocal.id);
    await expect(comparison.getByTestId("cas-comparison-verdict")).toContainText("verified agreement");
    await comparison.getByLabel("Left comparison evidence").selectOption(qq.id);
    await comparison.getByLabel("Right comparison evidence").selectOption(zz.id);
    await expect(comparison.getByTestId("cas-comparison-verdict")).toContainText("reported consistency");
  } finally { await closeSurfaceApp(ctx); }
});
