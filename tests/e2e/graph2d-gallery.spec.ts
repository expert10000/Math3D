import { expect, test } from "@playwright/test";
import { launchSurfaceApp,closeSurfaceApp,resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { resolve } from "node:path";
import { existsSync,readFileSync } from "node:fs";
const {createGraph2DWorkspaceProject,createMixedWorkspaceDocument,getGraph2DPresetCatalog,instantiateGraph2DPreset,
  promoteGraph2DToCurve,analyzeGraph2DDerivative,createWorkspaceProjectHandoff,serializeWorkspaceProjectHandoff,parseWorkspaceProjectHandoff}=require(resolve("packages/core/src/index.ts"));
const {importMobileGraph,readMobileGraph,updateStoredMobileGraph}=require(resolve("apps/mobile/src/models/mobileGraphProject.ts"));
const {serializeMobileProjectHandoff}=require(resolve("apps/mobile/src/models/mobileProjectTransfer.ts"));
const {Graph2DCommandAdapter}=require(resolve("packages/kernel/src/graph2dCommandAdapter.ts"));

test("GGL04 desktop browse/preview creates independent editable scenes and resumes preserved work",async()=>{
  const app=await launchSurfaceApp();
  try {
    const page=app.page;await resetSurfaceAppState(page);await page.setViewportSize({width:1440,height:900});
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByRole("button",{name:"Explore Graph Gallery",exact:true}).click();
    const gallery=page.getByTestId("graph-gallery");await expect(gallery).toBeVisible();
    await expect(gallery.getByRole("status")).toContainText("6 scenes");
    await page.screenshot({path:resolve("output/ggl04-gallery-desktop.png")});
    await gallery.getByRole("button",{name:"Preview Lissajous loops",exact:true}).click();
    await expect(gallery.getByRole("heading",{name:"Lissajous loops",exact:true})).toBeVisible();
    await gallery.getByRole("button",{name:"Close Graph Gallery"}).click();
    await expect(page.getByRole("button",{name:"Explore Graph Gallery",exact:true})).toBeFocused();
    await expect(page.getByLabel("Empty graph scene")).toContainText("0 functions");
    await page.getByTestId("graph-gallery-open").click();
    await gallery.getByRole("button",{name:"All scenes",exact:true}).click();
    await expect(gallery.getByRole("status")).toContainText("20 scenes");
    await gallery.getByLabel("Search graphs").fill("slope");
    await gallery.getByRole("button",{name:"Open Two slopes",exact:true}).click();
    await expect(gallery).not.toBeVisible();
    const functions=page.getByLabel("Graph functions");await expect(functions.getByRole("button",{name:"Edit Unit slope",exact:true})).toBeVisible();
    await functions.getByRole("button",{name:"Edit Unit slope",exact:true}).click();
    await functions.getByLabel("Function expression").fill("3*x");await functions.getByRole("button",{name:"Save function",exact:true}).click();
    await page.getByTestId("graph-gallery-open").click();await gallery.getByRole("button",{name:"Open Lissajous loops",exact:true}).click();
    await expect(functions.getByRole("button",{name:"Edit Lissajous",exact:true})).toBeVisible();
    await page.getByTestId("graph-gallery-open").click();await gallery.getByText(/Preserved projects/).click();
    await gallery.getByRole("button",{name:"Resume Two slopes",exact:true}).click();
    await functions.getByRole("button",{name:"Edit Unit slope",exact:true}).click();
    await expect(functions.getByLabel("Function expression")).toHaveValue("3*x");
    await page.getByTestId("kernel-workspace-toggle").click();await page.getByTestId("kernel-workspace-save").click();
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    expect(saved.entries.find((e:{module:string})=>e.module==="graph2d").checkpoint.source.objects[0].expression.source).toBe("3*x");
  } finally {await closeSurfaceApp(app);}
});

test("GGL06 preserves imported results/companions, recovers storage failure, and round trips a gallery edit",async()=>{
  const app=await launchSurfaceApp();
  try {
    const page=app.page;await resetSurfaceAppState(page);await page.setViewportSize({width:1440,height:900});await page.getByTestId("workspace-nav-graphs").click();
    const original=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent"),"gallery-companion").document;
    const target=promoteGraph2DToCurve(original,original.source.objects[0].id),result=analyzeGraph2DDerivative({document:original,objectId:original.source.objects[0].id,x:1,order:1,tolerance:1e-5}).publication;
    const workspace=createMixedWorkspaceDocument({...createGraph2DWorkspaceProject(original),
      entries:[...createGraph2DWorkspaceProject(original).entries,{module:"curve",checkpoint:target.document,expected:target.document.identity,replay:null}],relations:[target.relation],results:[result]});
    const manifest=createWorkspaceProjectHandoff(workspace,{producer:{platform:"desktop",name:"Gallery regression",version:"1"}});
    await page.getByTestId("kernel-workspace-toggle").click();await page.getByTestId("graph2d-handoff-import").setInputFiles({name:"original.json",mimeType:"application/json",buffer:Buffer.from(serializeWorkspaceProjectHandoff(manifest))});
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Opened Graph handoff");await page.getByTestId("kernel-workspace-toggle").click();
    await page.evaluate(()=>{const setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key:string,value:string){if(key==="math3d.mixed-workspace.v1"){
      Storage.prototype.setItem=setItem;throw new DOMException("Injected unavailable storage","QuotaExceededError");}return setItem.call(this,key,value);};});
    await page.getByTestId("graph-gallery-open").click();const gallery=page.getByTestId("graph-gallery");
    await gallery.getByRole("button",{name:"Open Lissajous loops",exact:true}).click();await expect(gallery.getByRole("alert")).toContainText("Current work remains open");
    await gallery.getByRole("button",{name:"Close Graph Gallery"}).click();await expect(page.getByLabel("Graph functions").getByRole("button",{name:"Edit Parabola",exact:true})).toBeVisible();
    expect((await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.graph2d-handoff.v2")!))).projectId).toBe(original.identity.id);
    await page.getByTestId("graph-gallery-open").click();await gallery.getByRole("button",{name:"Open Lissajous loops",exact:true}).click();
    await page.getByTestId("graph-gallery-open").click();await gallery.getByText(/Preserved projects/).click();await gallery.getByRole("button",{name:"Resume A tangent at x = 1",exact:true}).click();
    const retained=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    expect(retained.results).toEqual([result]);expect(retained.relations).toEqual([target.relation]);expect(retained.entries[1].checkpoint).toEqual(target.document);
    await page.getByTestId("graph-gallery-open").click();await gallery.getByRole("button",{name:"All scenes",exact:true}).click();await gallery.getByLabel("Search graphs").fill("slope");
    await gallery.getByRole("button",{name:"Open Two slopes",exact:true}).click();const functions=page.getByLabel("Graph functions");
    await functions.getByRole("button",{name:"Edit Unit slope",exact:true}).click();await functions.getByLabel("Function expression").fill("4*x");await functions.getByRole("button",{name:"Save function",exact:true}).click();
    await page.getByTestId("main-viewer").focus();await page.keyboard.press("Control+z");
    await page.getByTestId("kernel-workspace-toggle").click();await page.getByTestId("kernel-workspace-save").click();
    expect((await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!))).entries.find((e:{module:string})=>e.module==="graph2d").checkpoint.source.objects[0].expression.source).toBe("x");
    await page.getByTestId("kernel-workspace-toggle").click();await page.getByTestId("main-viewer").focus();await page.keyboard.press("Control+y");
    await page.getByTestId("kernel-workspace-toggle").click();
    const path=resolve(`output/ggl06-gallery-${Date.now()}.handoff.json`);await app.app.evaluate(({session},savePath)=>session.defaultSession.once("will-download",(_event,item)=>item.setSavePath(savePath)),path);
    await page.getByTestId("graph2d-handoff-export").click();await expect.poll(()=>existsSync(path)).toBe(true);
    const outbound=parseWorkspaceProjectHandoff(readFileSync(path,"utf8"));expect(outbound.baseRevision).toBeNull();expect(outbound.project.entries[0].checkpoint.source.objects[0].expression.source).toBe("4*x");
    let mobile=importMobileGraph(readFileSync(path,"utf8"),[],"gallery.handoff.json",1,"desktop"),commands=new Graph2DCommandAdapter(readMobileGraph(mobile));
    commands.commitViewport({...commands.document().display.viewport,xMin:-2.5});mobile=updateStoredMobileGraph(mobile,commands.document(),2);
    await page.getByTestId("graph2d-handoff-import").setInputFiles({name:"mobile-return.json",mimeType:"application/json",buffer:Buffer.from(serializeMobileProjectHandoff(mobile))});
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Opened Graph handoff");await page.getByTestId("kernel-workspace-save").click();
    const returned=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    expect(returned.entries[0].checkpoint.identity.id).toBe(outbound.projectId);expect(returned.entries[0].checkpoint.display.viewport.xMin).toBe(-2.5);
    expect(returned.entries[0].checkpoint.source.objects[0].expression.source).toBe("4*x");
  } finally {await closeSurfaceApp(app);}
});

test("GGL05 favorites and recents persist without duplicating saved graphs",async()=>{
  const app=await launchSurfaceApp();
  try {
    const page=app.page;await resetSurfaceAppState(page);await page.setViewportSize({width:1440,height:900});
    await page.getByTestId("workspace-nav-graphs").click();await page.getByTestId("graph-gallery-open").click();
    const gallery=page.getByTestId("graph-gallery"),favorite=gallery.getByRole("button",{name:"Favorite A three-petal rose",exact:true});
    await favorite.click();await expect(favorite).toHaveAttribute("aria-pressed","true");
    await gallery.getByRole("button",{name:"Favorites",exact:true}).click();await expect(gallery.getByRole("status")).toContainText("1 scene");
    await gallery.getByRole("button",{name:"Open A three-petal rose",exact:true}).click();
    await page.getByTestId("graph-gallery-open").click();await gallery.getByRole("button",{name:"Recent",exact:true}).click();
    await expect(gallery.getByTestId("graph-gallery-card-polar-rose")).toBeVisible();
    await gallery.getByRole("button",{name:"Close Graph Gallery"}).click();await page.reload();
    await page.getByTestId("workspace-nav-graphs").click();await page.getByTestId("graph-gallery-open").click();
    await gallery.getByRole("button",{name:"Favorites",exact:true}).click();await expect(gallery.getByRole("status")).toContainText("1 scene");
    await gallery.getByRole("button",{name:"Favorite A three-petal rose",exact:true}).click();
    await expect(gallery.getByRole("status")).toContainText("0 scenes");await expect(gallery.getByText(/Bookmark a scene/)).toBeVisible();
    await gallery.getByRole("button",{name:"Recent",exact:true}).click();await expect(gallery.getByRole("status")).toContainText("1 scene");
    const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.graph2d.gallery-preferences.v1")!));
    expect(settings.favorites).toEqual([]);expect(settings.recent).toEqual(["polar-rose"]);
  } finally {await closeSurfaceApp(app);}
});

test("GGL12 exports a personal Graph and previews, cancels, then imports an independent copy",async()=>{
  const app=await launchSurfaceApp();
  try{
    const page=app.page;await resetSurfaceAppState(page);await page.setViewportSize({width:1440,height:900});
    await page.getByTestId("workspace-nav-graphs").click();await page.getByTestId("graph-gallery-open").click();
    const gallery=page.getByTestId("graph-gallery");await gallery.getByRole("button",{name:"All scenes",exact:true}).click();
    await gallery.getByRole("button",{name:"Open Two slopes",exact:true}).click();
    const original=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.graph2d-handoff.v2")!).projectId);
    await page.getByTestId("graph-gallery-open").click();await gallery.getByRole("button",{name:"My Graphs",exact:true}).click();
    const path=resolve(`output/ggl12-personal-${Date.now()}.handoff.json`);
    await app.app.evaluate(({session},savePath)=>session.defaultSession.once("will-download",(_event,item)=>item.setSavePath(savePath)),path);
    await gallery.getByRole("button",{name:"Export preset Two slopes",exact:true}).click();
    await expect.poll(()=>existsSync(path)).toBe(true);
    const outbound=parseWorkspaceProjectHandoff(readFileSync(path,"utf8"));expect(outbound.projectId).toBe(original);
    const input=gallery.getByTestId("graph-personal-import-file");
    await input.setInputFiles({name:"my-graph.json",mimeType:"application/json",buffer:Buffer.from(readFileSync(path))});
    await expect(gallery.getByTestId("graph-personal-import-preview")).toBeVisible();
    await expect(gallery.getByAltText("Two slopes graph import preview")).toBeVisible();
    await gallery.getByRole("button",{name:"Cancel import",exact:true}).click();
    expect((await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.graph2d-handoff.v2")!))).projectId).toBe(original);
    await input.setInputFiles({name:"my-graph.json",mimeType:"application/json",buffer:Buffer.from(readFileSync(path))});
    await gallery.getByRole("button",{name:"Import as independent Graph",exact:true}).click();
    await expect(gallery).not.toBeVisible();
    const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.graph2d-handoff.v2")!));
    expect(imported.projectId).not.toBe(original);
    expect(imported.project.entries[0].checkpoint.source).toEqual(outbound.project.entries[0]!.checkpoint.source);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1.gallery-checkpoints")!));
    expect(saved.some((entry:{id:string})=>entry.id===original)).toBe(true);
  }finally{await closeSurfaceApp(app);}
});
