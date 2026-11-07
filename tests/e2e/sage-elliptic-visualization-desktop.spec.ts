import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-G05 separates real tangent geometry from complete GF(5) points after Project reopen", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g05-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-g05-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g05-desktop", title: "Curve views" });
    const add = (key: string, label: string, definition: Record<string, unknown>) => {
      const record = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, key),
        revision: 1, label, definition });
      project = core.upsertMath3DProjectAlgebraObject(project, record);
      return record;
    };
    const q = add("Q", "Q", { kind: "rational-field" });
    const f5 = add("F5", "F5", { kind: "finite-field", characteristic: 5, degree: 1,
      generator: "a", construction: "canonical" });
    const eReal = add("EReal", "EReal", { kind: "elliptic-curve",
      baseField: { objectId: q.id, revision: 1 }, model: "short-weierstrass", a: "-1", b: "1" });
    const eFinite = add("EFinite", "EFinite", { kind: "elliptic-curve",
      baseField: { objectId: f5.id, revision: 1 }, model: "short-weierstrass", a: "1", b: "1" });
    for (const [curve, field, characteristic, discriminant, jInvariant, doublePoint] of [
      [eReal, q, 0, "-368", "-6912/23", ["1/4", "-7/8"]],
      [eFinite, f5, 5, "4", "2", ["4", "2"]],
    ] as const) {
      const target = { objectId: curve.id, revision: 1 };
      const request = core.buildAlgebraOperationRequest(project, target, "sage.ellipticCurve.dossier", "docker",
        { point: ["0", "1"] });
      const result = { format: "math3d.sage-elliptic-curve-result", schemaVersion: 1,
        target, targetHash: curve.contentHash, baseField: { objectId: field.id, revision: 1 },
        characteristic, discriminant, jInvariant, singular: false,
        point: ["0", "1"], doublePoint };
      const evidence = core.createProjectAlgebraEvidence(project.identity.id, project.algebraObjects, request, result,
        { engine: "sagemath", version: "10.10", backend: "docker", jobId: `sage-g05-${characteristic}`,
          elapsedMs: 1, warnings: [] });
      project = core.addMath3DProjectAlgebraEvidence(project, evidence);
    }
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
      await ctx!.page.getByTestId("workspace-nav-number_theory").click();
    };
    const checkViews = async () => {
      const theory = ctx!.page.getByTestId("number-theory-workspace");
      await theory.getByTestId("cas-structures-explorer").getByRole("button", { name: /^EReal @1/ }).click();
      const real = theory.getByTestId("cas-elliptic-real-view");
      await expect(real).toContainText("Real-coordinate curve · numerical sample");
      await expect(real.getByTestId("cas-elliptic-real-tangent")).toContainText("tangent slope -1/2");
      await expect(real.getByTestId("cas-elliptic-real-tangent")).toContainText("2P=(1/4, -7/8)");
      await expect(real.locator("svg path")).toHaveCount(2);
      await real.screenshot({ path: "test-results/sage-g05-real.png" });
      await theory.getByTestId("cas-structures-explorer").getByRole("button", { name: /^EFinite @1/ }).click();
      const finite = theory.getByTestId("cas-elliptic-finite-view");
      await expect(finite).toContainText("Discrete GF(5) coordinate diagram · complete enumeration");
      await expect(finite).toContainText("8 affine points plus the point at infinity O; group order 9");
      await expect(finite.getByTestId("cas-elliptic-finite-rule")).toContainText("does not draw real chords or tangents");
      await expect(finite.getByTestId("cas-elliptic-finite-rule")).toContainText("2P=(4, 2)");
      await expect(finite.locator("svg circle")).toHaveCount(8);
      await expect(finite.locator("svg line, svg path")).toHaveCount(0);
      await finite.screenshot({ path: "test-results/sage-g05-finite.png" });
    };
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    await checkViews();
    await ctx.page.getByTestId("number-theory-workspace").getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    await checkViews();
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === eReal.id).revisions[0]).toEqual(eReal);
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === eFinite.id).revisions[0]).toEqual(eFinite);
    expect(imported.algebraEvidence).toHaveLength(2);
  } finally { await closeSurfaceApp(ctx); }
});
