import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";
const core = require(resolve("packages/core/src/index.ts"));
const filename = resolve("tests/fixtures/unified-projects/meshResources.ts");
const { outputFiles } = require(resolve("renderer/node_modules/esbuild")).buildSync({ entryPoints: [filename], bundle: true, platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve("packages/core/src/index.ts"), "@math3d/kernel": resolve("packages/kernel/src/index.ts") } });
const Module = require("node:module").Module, fixtureModule = new Module(filename); fixtureModule._compile(outputFiles[0].text, filename);
const { meshResourceFixture, inspectMeshPackage } = fixtureModule.exports;
const readProject = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
const fullPanel = async (page: Page) => {
  const c = freezeControls(page); await c.show();
  if (await c.panel.getAttribute("data-project-placement")) await c.panel.getByTestId("project-gallery-layout-toggle").click();
  if (await c.panel.locator(".project-gallery-layout-detail").count()) await c.panel.getByTestId("project-detail-toggle").click();
  return c;
};
const operations = async (page: Page) => {
  const card = page.getByTestId("mesh-workspace-operation-registry");
  if (!await card.isVisible()) await page.getByRole("button", { name: "Mesh tools", exact: true }).filter({visible:true}).click();
  await expect(card).toBeVisible();
  const row = card.getByTestId("mesh-workspace-operation-registry-row-clean-normals");
  if (await row.getAttribute("aria-expanded") !== "true") await row.click();
  await card.getByTestId("mesh-workspace-operation-registry-clean-normals-output-replace").check();
  return { card, run: card.getByTestId("mesh-workspace-operation-registry-run-clean-normals") };
};
const center = async (page: Page) => { await page.getByTestId("top-compute-center-button").click(); return page.getByTestId("compute-center"); };
const diagnostics = (ctx: LaunchedSurfaceApp) => ctx.page.evaluate(() => (window as any).pythonWorkerDiagnostics.getStatus());
// Observes only real VTK replies. It delegates unchanged to the production method,
// records its actual bytes, and never supplies a result or edits application state.
const observeWorker = (ctx: LaunchedSurfaceApp) => ctx.app.evaluate(async () => {
  const req = process.getBuiltinModule("module").createRequire(process.getBuiltinModule("path").resolve("dist/main.js"));
  const worker = await req("./main/python/pythonWorker.js").getPythonWorker();
  const pid = (worker as any).proc.pid;
  const original = worker.vtkMesh.bind(worker); (globalThis as any).__nativeRecovery = { pid, replies: [] };
  worker.vtkMesh = async (...args: any[]) => {
    const result = await original(...args);
    if (result.ok) (globalThis as any).__nativeRecovery.replies.push({ op: args[0], jobId: args[1].jobId,
      positions: [...new Float32Array(result.positions)], indices: [...new Uint32Array(result.indices)],
      normals: result.normals ? [...new Float32Array(result.normals)] : [],
      positionSha256: req("node:crypto").createHash("sha256").update(Buffer.from(result.positions)).digest("hex") });
    return result;
  };
  return { pid, version: await worker.version(), health: await worker.health() };
});
const replies = (ctx: LaunchedSurfaceApp) => ctx.app.evaluate(() => (globalThis as any).__nativeRecovery.replies);

test("AC08 Windows native compute/save, actual worker loss, offline cold-reopen and negotiated retry", async () => {
  test.setTimeout(300_000);
  expect(process.platform, "This acceptance requires an actual Windows runner; never skip it").toBe("win32");
  const python = process.env.MATH3D_PYTHON!; expect(python).toBeTruthy();
  const missingPython = resolve("native-recovery-evidence", "unavailable-python.exe");
  const fixture = meshResourceFixture(); let ctx: LaunchedSurfaceApp | null = null;
  const receipt: any = { repository: "expert10000/Math3D", sourceCommit: process.env.TEST_SOURCE_SHA,
    harnessCommit: process.env.MATH3D_HARNESS_SHA, platform: process.platform, node: process.version,
    baselineApproved: false, checks: [], scope: "Windows source Electron, real Python/VTK; no Sage/WSL, signed installer or release certification" };
  const record = (name: string, details: any = {}) => { receipt.checks.push({ name, status: "passed", ...details }); };
  try {
    ctx = await launchSurfaceApp({ MATH3D_PYTHON: python, MATH3D_WORKER_MODE: "python", MATH3D_WORKER_FAILURE_INJECTION: "none" });
    let page = ctx.page; await resetSurfaceAppState(page);
    const c = freezeControls(page); await c.importOpen(fixture.raw); await c.open(fixture.docs[0].identity.id);
    let cc = await center(page); await expect(cc.getByTestId("runtime-route-python").getByLabel("ready", {exact:true})).toBeVisible({timeout:45000});
    await expect(cc.getByTestId("runtime-route-vtk").getByLabel("ready", {exact:true})).toBeVisible(); await cc.getByRole("button", {name:"Close",exact:true}).click();
    const initialWorker = await observeWorker(ctx); expect(initialWorker.health.ok).toBe(true); expect(initialWorker.version.protocol).toBe("2026-03-15");
    let op = await operations(page); await expect(op.run).toBeEnabled({timeout:15000}); await op.run.click();
    await expect.poll(async () => (await replies(ctx!)).length).toBe(1);
    await expect(op.card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/Clean/i);
    await expect(op.card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/VTK/i);
    const actualOutput = (await replies(ctx))[0]; const saved = await c.save(); await c.hide();
    expect(saved.identity.id).toBe(fixture.project.identity.id);
    const computedIdentity=saved.workspace.entries.find((e:any)=>e.expected.id===fixture.docs[0].identity.id)!.expected;
    expect(computedIdentity.revision).toBeGreaterThan(fixture.docs[0].identity.revision);
    expect(computedIdentity.structuralHash).not.toBe(fixture.docs[0].identity.structuralHash);
    expect(saved.workspace.results).toEqual(expect.arrayContaining([fixture.result]));
    const exportPackage = async (name: string) => {
      const controls = await fullPanel(page), path = test.info().outputPath(name);
      await ctx!.app.evaluate(({session}, filename) => session.defaultSession.once("will-download", (_event,item) => item.setSavePath(filename)), path);
      await controls.panel.getByTestId("project-export-resources").click();
      await expect(controls.panel.getByTestId("project-message")).toContainText("Exported project with verified");
      await expect.poll(() => {try{return JSON.parse(readFileSync(path,"utf8")).format;}catch{return null;}}).toBe("math3d.project-package");
      const raw = readFileSync(path,"utf8"), pack = JSON.parse(raw);
      for (const resource of pack.resources) expect(core.sha256Checksum(Buffer.from(resource.data,"base64"))).toBe(resource.checksum);
      await controls.hide(); return {raw,pack};
    };
    const outbound = await exportPackage("outbound.json"), meshes = inspectMeshPackage(outbound.raw);
    expect(meshes.some((m:any) => JSON.stringify(m.positions)===JSON.stringify(actualOutput.positions) && JSON.stringify(m.normals)===JSON.stringify(actualOutput.normals))).toBe(true);
    record("native pointer computation and save preserve actual VTK output", {initialWorker,actualOutput,projectId:saved.identity.id,diagnostics:await diagnostics(ctx)});
    const lost = await ctx.app.evaluate(async (_electron, unavailable) => {
      process.env.MATH3D_PYTHON = unavailable;
      const req = process.getBuiltinModule("module").createRequire(process.getBuiltinModule("path").resolve("dist/main.js"));
      const worker = await req("./main/python/pythonWorker.js").getPythonWorker();
      const child=(worker as any).proc, pid=child.pid;
      await new Promise<void>(done=>{child.once("exit",()=>done());child.kill("SIGKILL");});return {pid};
    }, missingPython); expect(lost.pid).toBe(initialWorker.pid);
    await expect.poll(async ()=>(await diagnostics(ctx!)).available).toBe(false);
    cc=await center(page); await expect(cc.getByTestId("runtime-route-python").getByLabel("unavailable",{exact:true})).toBeVisible();
    await expect(cc.getByTestId("runtime-route-vtk").getByLabel("unavailable",{exact:true})).toBeVisible();
    await cc.getByRole("button",{name:"Close",exact:true}).click();op=await operations(page);await expect(op.run).toBeDisabled({timeout:15000});
    expect(await readProject(page)).toEqual(saved);record("actual worker process death disables execution without deleting saved results",{lost,diagnostics:await diagnostics(ctx)});
    const profile=ctx.profileDir;await ctx.app.close();ctx=await launchSurfaceApp({MATH3D_PYTHON:missingPython,MATH3D_WORKER_MODE:"python",MATH3D_WORKER_FAILURE_INJECTION:"none"},profile);page=ctx.page;
    const controls=await fullPanel(page);await controls.panel.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await expect(controls.panel.getByTestId("project-message")).toContainText("Opened supported project workspace");
    await expect.poll(async ()=>(await readProject(page))?.identity?.id).toBe(saved.identity.id);const reopened=await readProject(page);
    expect(reopened).toEqual(saved);expect(reopened.workspace.results).toEqual(saved.workspace.results);expect(reopened.workspace.entries.map((e:any)=>e.expected)).toEqual(saved.workspace.entries.map((e:any)=>e.expected));
    await controls.panel.getByTestId("project-inspect-relations").click();await expect(controls.panel.getByTestId(`project-result-status-${fixture.result.resultId}`)).toBeVisible();await controls.hide();
    const returned=await exportPackage("returned.json");expect(returned.pack.resources).toEqual(outbound.pack.resources);
    cc=await center(page);await expect(cc.getByTestId("runtime-route-python").getByLabel("unavailable",{exact:true})).toBeVisible();await cc.getByRole("button",{name:"Close",exact:true}).click();
    await freezeControls(page).open(fixture.docs[0].identity.id);op=await operations(page);await expect(op.run).toBeDisabled();
    record("offline native cold-reopen retains exact identities, historical result and resource bytes",{diagnostics:await diagnostics(ctx),resources:returned.pack.resources.map(({data,...reference}:any)=>reference)});
    await ctx.app.evaluate((_electron, executable)=>{process.env.MATH3D_PYTHON=executable;},python);
    cc=await center(page);await cc.getByRole("button",{name:"Refresh",exact:true}).click();
    await expect(cc.getByTestId("runtime-route-python").getByLabel("ready",{exact:true})).toBeVisible({timeout:45000});await expect(cc.getByTestId("runtime-route-vtk").getByLabel("ready",{exact:true})).toBeVisible();
    const recoveredWorker=await observeWorker(ctx);expect(recoveredWorker.health.ok).toBe(true);expect(recoveredWorker.version.protocol).toBe(initialWorker.version.protocol);
    await cc.getByRole("button",{name:"Close",exact:true}).click();record("UI refresh negotiates a fresh real worker handshake",{recoveredWorker,diagnostics:await diagnostics(ctx)});
    op=await operations(page);await expect(op.run).toBeEnabled({timeout:15000});await op.run.click();await expect.poll(async ()=>(await replies(ctx!)).length).toBe(1);
    const retried=(await replies(ctx))[0];expect(retried.positions).toEqual(actualOutput.positions);expect(retried.indices).toEqual(actualOutput.indices);expect(retried.normals).toEqual(actualOutput.normals);
    await expect(op.card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText(/VTK/i);expect((await readProject(page)).workspace.results).toEqual(saved.workspace.results);
    record("native explicit retry computes matching bytes while historical results stay intact",{retried});
    writeFileSync(test.info().outputPath("saved.json"),JSON.stringify(saved));writeFileSync(test.info().outputPath("reopened.json"),JSON.stringify(reopened));
    receipt.result="passed";
  } catch(error) {receipt.result="failed";receipt.error=String(error);throw error;}
  finally {writeFileSync(test.info().outputPath("native-recovery-receipt.json"),JSON.stringify(receipt,null,2));await closeSurfaceApp(ctx);}
});
