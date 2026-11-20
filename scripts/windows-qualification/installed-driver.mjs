#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile, rename, access } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { promisify, isDeepStrictEqual } from "node:util";
import { _electron as electron } from "playwright";

const command = promisify(execFile);
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) =>
  value.startsWith("--") ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
if(process.platform!=="win32") throw new Error("Installed Windows qualification requires Windows; never skip or relabel a source run");
for (const name of ["phase", "package", "app", "profile", "receipt", "source-sha", "harness-sha", "fixture", "expected-version"])
  if (!args[name]) throw new Error(`Missing --${name}`);
if (!["seed", "upgrade", "fresh-profile", "journey"].includes(args.phase))
  throw new Error(`Unknown phase: ${args.phase}`);

const packagePath = path.resolve(args.package);
const appPath = path.resolve(args.app);
const profile = path.resolve(args.profile);
const userData = path.join(profile, "user-data");
const receiptPath = path.resolve(args.receipt);
const fixture = JSON.parse(await readFile(path.resolve(args.fixture),"utf8"));
// Fixture provenance is recorded independently; it is not application acceptance evidence.
const expectedVersion = args["expected-version"];
const projectTitle = "Windows qualification upgrade Graph";
const checkpointKey = "math3d.mixed-workspace.v1";
const packageHash = createHash("sha256");
for await (const chunk of createReadStream(packagePath)) packageHash.update(chunk);
const result = {
  schema: "math3d/windows-installed-phase/v1", phase: args.phase, platform: process.platform,
  package: path.basename(packagePath), packageSha256: packageHash.digest("hex"),
  packageBytes: (await stat(packagePath)).size, expectedVersion, sourceCommit: args["source-sha"], harnessCommit: args["harness-sha"], scope: "Installed Windows; frozen Python/VTK worker; Mesh operation uses existing application test hook, refresh/save/reopen use UI. No Sage/WSL or signing approval.", checks: {},
};

function assert(value, message) { if (!value) throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function launch(targetProfile = profile) {
  const targetUserData = path.join(targetProfile, "user-data");
  const env = { ...process.env, MATH3D_E2E: "1", MATH3D_WORKER_MODE: "exe", MATH3D_E2E_PROFILE_ROOT: targetProfile,
    MATH3D_E2E_USER_DATA_DIR: targetUserData, MATH3D_SKIP_AUTOSAVE_RECOVERY: "1" };
  for (const name of ["ELECTRON_RUN_AS_NODE", "PYTHONHOME", "PYTHONPATH", "MATH3D_PYTHON"])
    delete env[name];
  env.PATH = String(env.PATH ?? "").split(path.delimiter).filter(item => !/python|conda/i.test(item)).join(path.delimiter);
  return electron.launch({ executablePath: appPath, cwd: path.dirname(appPath),
    args: [`--user-data-dir=${targetUserData}`, "--no-sandbox", "--disable-gpu"], env, timeout: 120_000 });
}
async function ready(app) {
  assert(await app.evaluate(({ app }) => app.getVersion()) === expectedVersion,
    `Installed version is not ${expectedVersion}`);
  assert(await app.evaluate(({app}) => app.isPackaged), "Source Electron is not installed qualification");
  const page = await app.firstWindow();
  await page.getByRole("heading", { name: /^math3d$/i, level: 1 }).waitFor({ timeout: 90_000 });
  result.checks.launch = "passed";
  return page;
}
async function openProjectPanel(page) {
  const panel = page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  await panel.waitFor({ state: "visible" });
  if (!await panel.getByTestId("project-save").isVisible())
    await panel.getByTestId("project-gallery-layout-toggle").first().click();
  return panel;
}

async function graphPhase() {
  const app = await launch();
  try {
    const page = await ready(app);
    await page.getByTestId("top-settings-button").click();
    const setting = page.getByTestId("settings-command-preview-overlays-toggle");
    await setting.waitFor({ state: "visible" });
    if (args.phase === "seed") await setting.setChecked(false);
    assert(!await setting.isChecked(), "Saved preview-overlay setting was not retained");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    result.checks.profileSetting = "passed";
    await page.getByTestId("workspace-nav-graphs").click();
    if (args.phase === "seed") {
      await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Add Graph" }).click();
      await page.getByRole("dialog", { name: "Choose graph type" })
        .getByRole("button", { name: "Function", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Create graph" });
      const form = editor.getByRole("form", { name: "New function" });
      await form.getByLabel("Start from preset").selectOption("parabola");
      await form.getByLabel("Function expression").fill("x^2 + 1");
      await form.getByRole("button", { name: "Preview", exact: true }).click();
      await editor.getByLabel("Graph preview", { exact: true }).getByText("y = x^2 + 1").waitFor();
      await editor.getByRole("button", { name: "Create graph" }).click();
      await editor.waitFor({ state: "hidden" });
    }
    await page.getByTestId("graph-gallery-open").click();
    let gallery = page.getByTestId("graph-gallery");
    await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    if (args.phase === "seed") {
      await gallery.getByLabel("Reusable copy title").fill(projectTitle);
      await gallery.getByRole("button", { name: "Save current as reusable copy" }).click();
      await page.getByTestId("graph-gallery-open").click();
      gallery = page.getByTestId("graph-gallery");
      await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    }
    const savedButton = gallery.getByRole("button", { name: `Open project ${projectTitle}`, exact: true });
    await savedButton.waitFor({ state: "visible" });
    const checkpoint = await page.evaluate(key => localStorage.getItem(key), checkpointKey);
    assert(checkpoint?.includes(projectTitle) && checkpoint.includes("x^2 + 1"),
      "Named Graph Project or authored expression missing from checkpoint");
    const graph = JSON.parse(checkpoint).entries.find(entry => entry.module === "graph2d")?.checkpoint;
    assert(graph?.source?.objects?.length > 0, "Graph Project has no authored object");
    result.project = { title: projectTitle, checkpointSha256: sha256(checkpoint),
      checkpointBytes: Buffer.byteLength(checkpoint), graphObjects: graph.source.objects.length };
    if (args.phase !== "seed") {
      const seed = JSON.parse(await readFile(path.resolve(args.seed), "utf8"));
      assert(result.project.checkpointSha256 === seed.project.checkpointSha256,
        "Project checkpoint bytes changed across upgrade");
      await savedButton.click();
      await gallery.waitFor({ state: "hidden" });
    }
    result.checks.graphProject = "passed";
  } finally { await app.close(); }
}

async function center(page, state) {
  await page.getByTestId("top-compute-center-button").click();
  const panel = page.getByTestId("compute-center");
  await expect(panel.getByRole("button", {name:/^Refresh/})).toBeEnabled({timeout:90000});
  const snapshot=await page.evaluate(()=>window.pythonWorkerDiagnostics.getStatus());
  if(state === "ready" && !snapshot.available && snapshot.restartRetryAfter > Date.now()) {
    const waitMs=snapshot.restartRetryAfter-Date.now();
    assert(waitMs<=305000,"Unexpected restart backoff exceeds production five-minute window");
    result.restartBackoff={before:snapshot,waitMs,respectedWithoutReset:true};
    // Respect the real production circuit, rather than weakening/resetting it.
    while(Date.now() <= snapshot.restartRetryAfter+1000)
      await page.waitForTimeout(Math.min(1000,Math.max(1,snapshot.restartRetryAfter+1001-Date.now())));
    result.restartBackoff.waitCompletedAt=new Date().toISOString();
  }
  await panel.getByRole("button", {name:"Refresh",exact:true}).click();
  try {
    for (const route of ["python", "vtk"])
      await expect(panel.getByTestId(`runtime-route-${route}`).getByLabel(state,{exact:true})).toBeVisible({timeout:90000});
  } catch(error) {
    result.failureDiagnostics=await page.evaluate(()=>window.pythonWorkerDiagnostics.getStatus());
    result.failureComputeCenter=await panel.innerText();
    throw error;
  }
  await panel.getByRole("button",{name:"Close",exact:true}).click();
}
async function observe(app) {
  return app.evaluate(async ({app}) => {
    const req = process.getBuiltinModule("module").createRequire(process.getBuiltinModule("path").join(app.getAppPath(),"dist/main.js"));
    const worker = await req("./main/python/pythonWorker.js").getPythonWorker();
    const child = worker.proc;
    const original = worker.vtkMesh.bind(worker);
    globalThis.__installedReplies = [];
    worker.vtkMesh = async (...args) => {
      const output = await original(...args);
      if (output.ok) globalThis.__installedReplies.push(Object.fromEntries(["positions","indices","normals"].map(key => [key,output[key] ? req("node:crypto").createHash("sha256").update(Buffer.from(output[key])).digest("hex") : null])));
      return output;
    };
    return {pid:child.pid,executable:child.spawnfile,health:await worker.health(),version:await worker.version(),appPath:app.getAppPath()};
  });
}
async function journeyPhase() {
  assert(args.worker, "Journey needs actual installed --worker");
  const workerPath = path.resolve(args.worker), offlinePath=workerPath+".qualification-offline";
  result.workerSha256 = sha256(await readFile(workerPath));
  let app;
  try {
    app = await launch(); let page = await ready(app);
    await center(page,"ready");
    result.initialWorker = await observe(app);
    assert(path.resolve(result.initialWorker.executable).toLowerCase() === workerPath.toLowerCase(), "Worker process is not the installed frozen executable");
    assert(result.initialWorker.health.ok, "Installed worker handshake failed");
    let panel = await openProjectPanel(page);
    await panel.getByTestId("project-import-file").setInputFiles({name:"recovery.resources.json",mimeType:"application/json",buffer:Buffer.from(fixture.raw)});
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    const openMesh = async () => {
      panel=await openProjectPanel(page);
      const select=panel.getByTestId("project-viewer-document");
      if(await select.isVisible()) await select.selectOption(fixture.documentId);
      else {
        const open=panel.getByTestId(`project-open-${fixture.documentId}`);
        if(!await open.isVisible()) await panel.getByTestId("project-detail-tab-documents").click();
        await open.click();
      }
      if(await panel.isVisible()) await page.getByRole("button",{name:"Close project explorer"}).click();
      await page.waitForFunction(()=>!!window.__MATH3D_E2E_MESH_OPERATION__);
      const card=page.getByTestId("mesh-workspace-operation-registry");
      if(!await card.isVisible()) await page.getByRole("button",{name:"Mesh tools",exact:true}).filter({visible:true}).click();
      const row=card.getByTestId("mesh-workspace-operation-registry-row-clean-normals");
      if(await row.getAttribute("aria-expanded")!=="true") await row.click();
      await card.getByTestId("mesh-workspace-operation-registry-clean-normals-output-replace").check();
    };
    await openMesh();
    const exportResources = async (name) => {
      panel=await openProjectPanel(page);
      // Cold reopening selects the Project overview. Navigate its actual transfer
      // page rather than trying to click the hidden export control behind it.
      if(!await panel.getByTestId("project-export-resources").isVisible()) {
        const more=panel.locator(".project-header-more");
        if(await more.isVisible()) {
          await more.locator("summary").click();
          await more.getByRole("button",{name:"Import / export",exact:true}).click();
        } else {
          if(await panel.getAttribute("data-project-placement")) await panel.getByTestId("project-gallery-layout-toggle").click();
          if(await panel.locator(".project-gallery-layout-detail").count()) await panel.getByTestId("project-detail-toggle").click();
        }
      }
      await expect(panel.getByTestId("project-export-resources")).toBeVisible();
      const file=path.join(path.dirname(receiptPath),name);
      await app.evaluate(({session},file)=>session.defaultSession.once("will-download",(_event,item)=>item.setSavePath(file)),file);
      await panel.getByTestId("project-export-resources").click();
      await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
      await expect.poll(async()=>{try{return JSON.parse(await readFile(file,"utf8")).format}catch{return null}}).toBe("math3d.project-package");
      const pack=JSON.parse(await readFile(file,"utf8"));
      assert(pack.resources.length>0,"Expected real saved resource bytes");
      for(const item of pack.resources) assert("sha256:"+sha256(Buffer.from(item.data,"base64"))===item.checksum,"Exported resource checksum mismatch");
      if(await panel.isVisible()) await page.getByRole("button",{name:"Close project explorer"}).click();
      return pack.resources;
    };
    const compute = async () => {
      const output = await page.evaluate(() => window.__MATH3D_E2E_MESH_OPERATION__.run("clean-normals"));
      assert(output.ok, `Installed VTK operation failed: ${output.error}`);
      const replies = await app.evaluate(() => globalThis.__installedReplies);
      assert(replies.length === 1, "Expected exactly one real VTK reply"); return replies[0];
    };
    result.output = await compute();
    panel = await openProjectPanel(page);
    await panel.getByTestId("project-title").fill("Installed frozen runtime recovery");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText('Saved “');
    const checkpoint = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const saved = JSON.parse(checkpoint), projectId = saved.identity?.id;
    assert(projectId && saved.workspace.entries.some(e => /mesh/i.test(e.module)), "Computed Mesh was not saved");
    result.project = {id:projectId, checkpointSha256:sha256(checkpoint), identities:saved.workspace.entries.map(e=>e.expected), results:saved.workspace.results};
    assert(saved.workspace.results.length>0 && saved.workspace.results.some(r=>r.resultId===fixture.historicalResult.resultId),"Historical AnalysisResult was lost or fixture was not activated");
    result.outboundResources=await exportResources("installed-outbound.json");
    result.checks.computeSave = "passed";
    await writeFile(receiptPath,JSON.stringify({...result,status:"incomplete"},null,2));
    result.lostWorker = await app.evaluate(async ({app}, executable) => {
      const req=process.getBuiltinModule("module").createRequire(process.getBuiltinModule("path").join(app.getAppPath(),"dist/main.js"));
      const worker=await req("./main/python/pythonWorker.js").getPythonWorker();
      const child=worker.proc,pid=child.pid;
      const fs=req("node:fs");
      if(fs.existsSync(executable+".qualification-offline")) throw new Error("Refuse to replace a pre-existing offline worker");
      await new Promise((done,reject)=>{child.once("close",()=>{try{fs.renameSync(executable,executable+".qualification-offline");done();}catch(error){reject(error)}});child.kill("SIGKILL");});
      return {pid,unavailableExecutable:executable,parkedExecutable:executable+".qualification-offline"};
    }, workerPath);
    assert(result.lostWorker.pid === result.initialWorker.pid,"Wrong worker terminated");
    await center(page,"unavailable");
    assert(sha256(await page.evaluate(()=>localStorage.getItem("math3d.project.v1")))===result.project.checkpointSha256,"Runtime loss changed saved Project");
    result.checks.actualRuntimeLossRetainsProject = "passed";
    await app.close(); app=null;
    app=await launch();page=await ready(app);
    panel=await openProjectPanel(page);
    await panel.getByTestId(`project-open-saved-${projectId}`).click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project workspace");
    const reopened=await page.evaluate(()=>localStorage.getItem("math3d.project.v1"));
    assert(sha256(reopened)===result.project.checkpointSha256,"Offline cold-reopen changed identities, hashes or results");
    const returned=await exportResources("installed-returned.json");
    assert(isDeepStrictEqual(returned,result.outboundResources),"Offline cold reopen changed resource bytes/references");
    result.resourceHashes=returned.map(({data,...ref})=>ref);
    delete result.outboundResources;
    await center(page,"unavailable");
    result.checks.offlineColdReopen = "passed";
    await writeFile(receiptPath,JSON.stringify({...result,status:"incomplete"},null,2));
    await rename(offlinePath,workerPath);
    await center(page,"ready");
    result.recoveredWorker=await observe(app);
    assert(result.recoveredWorker.pid!==result.initialWorker.pid,"Expected fresh worker PID");
    assert(result.recoveredWorker.health.ok && result.recoveredWorker.version.protocol===result.initialWorker.version.protocol,"Recovered handshake mismatch");
    result.checks.reconnectCapabilityRefresh = "passed";
    await openMesh();
    result.retriedOutput=await compute();
    assert(isDeepStrictEqual(result.retriedOutput,result.output),"Retry changed computed output bytes");
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.project.v1")));
    assert(isDeepStrictEqual(after.workspace.results,saved.workspace.results),"Retry changed historical references");
    result.checks.successfulRetry = "passed";
    assert(sha256(await readFile(workerPath))===result.workerSha256,"Worker bytes changed");
  } finally {
    try { await access(offlinePath); await rename(offlinePath,workerPath); } catch(error) { if(error.code!=="ENOENT") throw error; }
    if(app) await app.close();
  }
}

async function fullTransfer(page) {
  const panel=await openProjectPanel(page), exportButton=panel.getByTestId("project-export-resources");
  if(!await exportButton.isVisible()) {
    const more=panel.locator(".project-header-more");
    if(await more.isVisible()) {await more.locator("summary").click();await more.getByRole("button",{name:"Import / export",exact:true}).click();}
    else {if(await panel.getAttribute("data-project-placement")) await panel.getByTestId("project-gallery-layout-toggle").click();if(await panel.locator(".project-gallery-layout-detail").count()) await panel.getByTestId("project-detail-toggle").click();}
  }
  return panel;
}
async function exported(app,page,filename) {
  const panel=await fullTransfer(page),file=path.resolve(path.dirname(receiptPath),filename);
  await app.evaluate(({session},file)=>session.defaultSession.once("will-download",(_event,item)=>item.setSavePath(file)),file);
  await panel.getByTestId("project-export-resources").click();
  await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
  await expect.poll(async()=>{try{return JSON.parse(await readFile(file,"utf8")).format}catch{return null}}).toBe("math3d.project-package");
  const pack=JSON.parse(await readFile(file,"utf8"));
  for(const item of pack.resources) assert("sha256:"+sha256(Buffer.from(item.data,"base64"))===item.checksum,"Source sidecar hash mismatch");
  return pack;
}
const facts=(project,historicalIds)=>({
  identityId:project.identity.id,
  entries:project.workspace.entries.map(entry=>({expected:entry.expected,replay:entry.replay,checkpoint:entry.checkpoint})),
  results:project.workspace.results.map(result=>{
    if(historicalIds.has(result.resultId)) return result;
    // Opening a Project refreshes derived analysis; its timing and computed payload hash can change.
    const copy=structuredClone(result);
    delete copy.provenance?.elapsedMs;
    delete copy.summary?.checksum;
    return copy;
  }),
  selection:project.workspace.committedSelection,
  artifacts:project.workspace.artifacts.map(artifact=>({handle:artifact.handle,byteLength:artifact.byteLength})),
  relations:project.workspace.relations,
});
async function freshProfile() {
  const seed=JSON.parse(await readFile(path.join(path.dirname(args.fixture),"profile-seed.json"),"utf8"));
  let app=await launch();const snapshots=[];
  try {
    const page=await ready(app);
    for(const [index,packet] of seed.packets.entries()) {
      const raw=await readFile(path.join(path.dirname(args.fixture),packet.file),"utf8");const expected=JSON.parse(raw).project;
      const panel=await fullTransfer(page);
      await panel.getByTestId("project-import-file").setInputFiles({name:packet.file,mimeType:"application/json",buffer:Buffer.from(raw)});
      await expect(panel.getByTestId("project-import-open")).toBeEnabled();await panel.getByTestId("project-import-open").click();
      await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
      const savePanel=await openProjectPanel(page);await savePanel.getByTestId("project-save").click();await expect(savePanel.getByTestId("project-message")).toContainText("Saved");
      const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem("math3d.project.v1")));
      assert(saved.identity.id===packet.projectId,"Imported Project identity changed");
      for(const entry of expected.workspace.entries) {
        const actual=saved.workspace.entries.find(e=>e.expected.id===entry.expected.id);assert(actual,"Fixture document missing");
        assert(isDeepStrictEqual(actual.expected,entry.expected),"Fixture document identity/hash changed");
        assert(isDeepStrictEqual(actual.checkpoint,entry.checkpoint),"Fixture document checkpoint changed");
        if(entry.replay===null) {
          const replayFormats={
            "math3d.graph2d-document":"math3d.graph2d-replay.v1",
            "math3d.volume-document":"math3d.volume-replay.v1",
            "math3d.curve-document":"math3d.curve-replay.v1",
            "math3d.surface-document":"math3d.surface-replay.v1",
            "math3d.geometry-document":"math3d.geometry-replay.v1",
            "math3d.topology-document":"math3d.topology-replay.v1",
            "math3d.complex-analysis-document":"math3d.complex-replay.v1",
          };
          assert(actual.replay?.format===replayFormats[entry.checkpoint?.format] &&
            actual.replay.payload?.checkpoint && actual.replay.payload.cursor===0 &&
            isDeepStrictEqual(actual.replay.payload.transactions,[]),"Legacy fixture replay migration changed");
        } else {
          assert(isDeepStrictEqual(actual.replay,entry.replay),"Fixture replay or committed selection changed");
        }
      }
      for(const historical of expected.workspace.results) assert(saved.workspace.results.some(r=>isDeepStrictEqual(r,historical)),"Historical result missing");
      const pack=await exported(app,page,`seed-${index}.resources.json`);assert(pack.resources.length>=packet.resourceCount,"Sidecar missing");
      const historicalIds=new Set(expected.workspace.results.map(result=>result.resultId));
      snapshots.push({id:saved.identity.id,revision:saved.identity.revision,historicalIds,project:facts(saved,historicalIds),resources:pack.resources});
      if(await savePanel.isVisible()) await page.getByRole("button",{name:"Close project explorer"}).click();
    }
  } finally {await app.close();}
  app=await launch();
  try {
    const page=await ready(app);
    for(const [index,snapshot] of snapshots.entries()) {
      const panel=await openProjectPanel(page);await panel.getByTestId(`project-open-saved-${snapshot.id}`).click();
      await expect(panel.getByTestId("project-message")).toContainText("Opened supported project workspace");
      const pack=await exported(app,page,`reopened-${index}.resources.json`);
      assert(pack.project.identity.revision>=snapshot.revision,"Cold reopen regressed Project revision");
      assert(isDeepStrictEqual(facts(pack.project,snapshot.historicalIds),snapshot.project),"Cold reopen changed Project source, historical result, selection or reference");
      assert(isDeepStrictEqual(pack.resources,snapshot.resources),"Cold reopen changed actual sidecar bytes");
      if(await panel.isVisible()) await page.getByRole("button",{name:"Close project explorer"}).click();
    }
    result.projects=snapshots.map(({id,project,resources})=>({id,checkpointFactsSha256:sha256(JSON.stringify(project)),resultCount:project.results.length,resources:resources.map(({data,...reference})=>reference)}));
    result.checks.isolatedFixtureSaveColdReopen="passed";
  } finally {await app.close();}
}

try {
  if (args.phase === "journey") await journeyPhase();
  else if(args.phase === "fresh-profile") await freshProfile();
  else await graphPhase();
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.failure = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await writeFile(receiptPath, JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(`Windows ${args.phase}: ${result.status}\n`);
  if (result.failure) process.stderr.write(result.failure + "\n");
}
