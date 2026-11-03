import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-A07 builds exact rings and fields and reselects one after an independent desktop restart", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-a06-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-a06-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const project = core.createMath3DProject(workspace, { stableKey: "sage-a06-desktop", title: "Algebra experiments" });
    const bytes = core.serializeMath3DProject(project);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: bytes });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    const projects = ctx.page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(cas.getByTestId("cas-structures-explorer")).toBeVisible();
    const form = cas.getByTestId("cas-new-structure-form");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Type").selectOption("integer-ring");
    await form.getByLabel("Name", { exact: true }).fill("Z");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("ZZ");
    await cas.getByRole("button", { name: "Create and save" }).click();
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Name").fill("Q");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("Fieldyes");
    await cas.getByRole("button", { name: "Create and save" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("Rational field QQ");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Type").selectOption("polynomial-ring");
    await form.getByLabel("Name").fill("R");
    await form.getByLabel("Coefficient domain").selectOption({ label: "Q@1 · QQ" });
    await form.getByLabel("Variables").fill("x, y");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("Q[x,y]");
    await cas.getByRole("button", { name: "Create and save" }).click();
    const dossier = cas.getByTestId("cas-selected-structure");
    await expect(dossier).toContainText("Q[x,y]");
    await expect(cas.getByTestId("cas-structure-inspector")).toContainText("Parent revisions");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Type").selectOption("modular-ring");
    await form.getByLabel("Name").fill("Z12");
    await form.getByLabel("Modulus n").fill("1");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByRole("alert")).toContainText("Modulus must");
    await form.getByLabel("Modulus n").fill("12");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("Zero divisorsyes");
    await cas.getByRole("button", { name: "Create and save" }).click();
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Type").selectOption("finite-field");
    await form.getByLabel("Name", { exact: true }).fill("F49");
    await form.getByLabel("Prime characteristic p").fill("9");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByRole("alert")).toContainText("prime");
    await form.getByLabel("Prime characteristic p").fill("7");
    await form.getByLabel("Extension degree n").fill("2");
    await form.getByLabel("Generator name").fill("a");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("GF(7^2)");
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("49");
    await cas.screenshot({ path: "test-results/sage-a07-builder-preview.png", animations: "disabled" });
    await cas.getByRole("button", { name: "Create and save" }).click();
    await expect(cas.getByTestId("cas-structure-inspector")).toContainText("49");
    await cas.screenshot({ path: "test-results/sage-a07-ring-field-builder.png", animations: "disabled" });
    const saved = await ctx.page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      const selected = JSON.parse(localStorage.getItem(`math3d.sage-structures.selection.v1.${project.identity.id}`)!);
      return { project, selected };
    });
    expect(saved.project.algebraObjects).toHaveLength(5);
    const r = saved.project.algebraObjects.find((item: { revisions: { label: string }[] }) => item.revisions[0].label === "R");
    expect(r.revisions[0].definition).toMatchObject({ kind: "polynomial-ring", variables: ["x", "y"],
      coefficientDomain: { revision: 1 } });
    const objectId = saved.selected.objectId, definitionHash = saved.project.algebraObjects.find((item: { id: string }) => item.id === objectId).revisions[0].contentHash;
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(cas.getByTestId("scientific-services-cas")).toBeVisible();
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect.poll(() => ctx!.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).algebraObjects?.length)).toBe(5);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(reopened.getByTestId("cas-selected-structure")).toContainText("GF(7^2)");
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(objectId);
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(definitionHash);
    const reopenedBytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    expect(core.parseMath3DProject(reopenedBytes).algebraObjects.find((item: { id: string }) => item.id === objectId)
      .revisions[0].contentHash).toBe(definitionHash);
  } finally { await closeSurfaceApp(ctx); }
});

test("SAGE-A07 previews a bounded Sage constructor and rejects mismatched evidence", async () => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  let mismatch = false;
  let advertiseReconstruction = true;
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", available: true,
        status: "ok", operations: advertiseReconstruction ? ["sage.algebra.reconstruct"] : ["sage.symbolic.simplify"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      requests.push(request.operation);
      const input = request.params;
      const target = input.objects.at(-1);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        success: true, latex: "\\mathbb{Q}", warnings: [], result: {
          format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
          target: input.target, kind: target.kind, definitionHash: mismatch ? "sha256:" + "0".repeat(64) : target.contentHash,
          text: "Rational Field", latex: "\\mathbb{Q}", characteristic: "0", isField: true,
        } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-a07-preview-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-a07-preview-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const project = core.createMath3DProject(workspace, { stableKey: "sage-a07-preview", title: "Preview Project" });
    const raw = core.serializeMath3DProject(project);
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await expect(cas.getByTestId("cas-algebra-runtime-docker")).toContainText("advertises bounded algebra reconstruction");
    await expect(cas.getByTestId("cas-algebra-runtime-local")).toContainText("Local WSL SageMath");
    const form = cas.getByTestId("cas-new-structure-form");
    await form.getByLabel("Name").fill("Q");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("Exact Sage constructor succeeded");
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("10.10");
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("Rational Field");
    expect(requests).toEqual(["sage.algebra.reconstruct"]);
    await cas.getByRole("button", { name: "Create and save" }).click();
    mismatch = true;
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Name").fill("Q2");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByRole("alert")).toContainText("Invalid or mismatched Sage algebra reconstruction result");
    await expect(cas.getByRole("button", { name: "Create and save" })).toHaveCount(0);
    advertiseReconstruction = false;
    await cas.getByRole("button", { name: "Refresh runtimes" }).click();
    await expect(cas.getByTestId("cas-algebra-runtime-docker")).toContainText("does not advertise sage.algebra.reconstruct");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("Sage constructor not checked");
    await expect(cas.getByTestId("cas-builder-preview")).toContainText("does not advertise sage.algebra.reconstruct");
    const savedCount = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).algebraObjects.length);
    expect(savedCount).toBe(1);
  } finally {
    await closeSurfaceApp(ctx);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
