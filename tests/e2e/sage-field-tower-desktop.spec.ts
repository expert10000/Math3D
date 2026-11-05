import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-D05 builds and independently reopens a verified Q→K→L field tower", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", available: true, status: "ok",
        operations: ["sage.algebra.reconstruct"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      const input = request.params;
      const target = input.objects.at(-1);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        success: true, latex: "", warnings: [], result: {
          format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
          target: input.target, kind: "field-extension", definitionHash: target.contentHash,
          text: "Number Field in b with defining polynomial t^2 - 3 over K", latex: "",
          characteristic: "0", isField: true,
          fieldExtension: { baseDegree: 2, relativeDegree: 2, absoluteDegree: 4,
            baseGeneratorImage: "a", extensionGenerator: "b", inclusionMapAvailable: true,
            baseRelationVerified: true, extensionRelationVerified: true },
        } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-d05-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-d05-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-d05-desktop", title: "Field tower" });
    const q = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "Q"),
      revision: 1, label: "Q", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, q);
    const k = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "K"),
      revision: 1, label: "K", definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
        definingPolynomial: ["-2", "0", "1"], generator: "a" } });
    project = core.upsertMath3DProjectAlgebraObject(project, k);
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
    };
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    const form = cas.getByTestId("cas-new-structure-form");
    await form.getByLabel("Type").selectOption("field-extension");
    await form.getByLabel("Name", { exact: true }).fill("L");
    await form.getByLabel("Tower base field").selectOption({ value: k.id });
    await form.getByLabel("Tower radicand").fill("2");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByRole("alert")).toContainText("already a square");
    await form.getByLabel("Tower radicand").fill("3");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    const preview = cas.getByTestId("cas-builder-preview");
    await expect(preview).toContainText("2 × 2 = 4");
    await expect(preview).toContainText("1, a, b, a*b");
    await expect(preview).toContainText("Exact Sage constructor succeeded");
    await preview.getByRole("button", { name: "Create and save" }).click();
    const tower = cas.getByTestId("cas-field-tower");
    await expect(tower).toContainText("Absolute degree 4");
    await expect(tower).toContainText("Q@1 ↪ K@1");
    await expect(tower).toContainText("K@1 ↪ L@1");
    await expect(tower).toContainText("a ↦ a");
    await expect(tower).toContainText("2 × 2 = 4");
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("b^2 - 3 = 0");
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Select Construct exact structure" }).click();
    await cas.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(cas.getByTestId("cas-evidence-result")).toContainText("Absolute degree4");
    await cas.getByRole("button", { name: "Structures", exact: true }).click();
    await expect(tower).toContainText("exact construction and Sage");
    await expect(tower.getByTestId("field-tower-evidence")).toContainText("Pinned Sage evidence · reconstruct · 10.10 · current source");
    const before = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const l = before.algebraObjects.find((item: { revisions: { kind: string }[] }) => item.revisions[0].kind === "field-extension").revisions[0];
    expect(l.definition).toEqual({ kind: "field-extension", baseField: { objectId: k.id, revision: 1 },
      radicand: "3", generator: "b" });
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(reopened.getByTestId("cas-field-tower")).toContainText("K@1 ↪ L@1");
    await expect(reopened.getByTestId("cas-field-tower")).toContainText("exact construction and Sage");
    await reopened.getByTestId("field-tower-evidence").click();
    await expect(reopened.getByTestId("cas-evidence-result")).toContainText("Absolute degree4");
    await reopened.getByTestId(`field-tower-node-${l.id}-1`).click();
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(l.contentHash);
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === l.id).revisions[0]).toEqual(l);
    expect(imported.algebraEvidence).toHaveLength(1);
    const k2 = core.createAlgebraObjectRecord({ id: k.id, revision: 2, label: "K revised",
      definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
        definingPolynomial: ["-5", "0", "1"], generator: "a" } });
    const changed = core.upsertMath3DProjectAlgebraObject(imported, k2);
    await reopened.getByRole("button", { name: "Back to workspace" }).click();
    await install(core.serializeMath3DProject(changed));
    const stale = ctx.page.getByTestId("cas-algebra-workspace").getByTestId("cas-field-tower");
    await expect(stale).toContainText("stale");
    await expect(stale.getByTestId("field-tower-evidence")).toContainText("stale source");
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
