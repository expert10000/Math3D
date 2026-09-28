import { expect,test } from "@playwright/test";
import { resolve } from "node:path";
import { comparePortable } from "./portableComparison";
const {getGraph2DPresetCatalog,sampleGraph2DScene}=require(resolve("packages/core/src/index.ts"));
type Workers={active:number;count:number;url:string};
const workerState=(page:import("@playwright/test").Page)=>page.evaluate(()=>(window as unknown as {galleryWorkers:Workers}).galleryWorkers);
test("GGL06 all gallery scenes preserve portable source and match real worker geometry",async({page},info)=>{
  await page.route("**/api/worker/**",r=>r.fulfill({status:503,body:'{"error":"Optional backend unavailable"}',contentType:"application/json"}));
  await page.addInitScript(()=>{
    // Exercise self-hosted HTTP compatibility where randomUUID is unavailable.
    Object.defineProperty(crypto,"randomUUID",{value:undefined,configurable:true});
    const NativeWorker=window.Worker,state={active:0,count:0,url:""};
    (window as unknown as {galleryWorkers:Workers}).galleryWorkers=state;
    window.Worker=class extends NativeWorker {
      tracked=false;stopped=false;
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.tracked=String(url).includes("graph2dSamplingWorker");if(this.tracked){state.active++;state.count++;state.url=String(url);}}
      terminate(){if(this.tracked&&!this.stopped){state.active--;this.stopped=true;}super.terminate();}
    };
  });
  await page.goto("/");await page.evaluate(()=>{localStorage.clear();localStorage.setItem("math3d.computeEngines.firstLaunchSeen","1");});await page.reload();
  await page.getByTestId("workspace-nav-graphs").click();await expect.poll(async()=>(await workerState(page)).active).toBe(0);
  const url=(await workerState(page)).url,count=(await workerState(page)).count;
  expect(url).toContain("graph2dSamplingWorker");
  await page.getByTestId("graph-gallery-open").click();const gallery=page.getByTestId("graph-gallery");
  await expect(gallery.getByLabel("Search graphs")).toBeFocused();
  await gallery.getByRole("button",{name:"All scenes",exact:true}).click();await expect(gallery.locator("article")).toHaveCount(20);
  await expect.poll(()=>gallery.locator("article img").evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  await gallery.getByRole("button",{name:"Preview Lissajous loops",exact:true}).click();
  await expect(gallery.getByRole("heading",{name:"Lissajous loops",exact:true})).toBeVisible();await page.keyboard.press("Escape");
  await expect(page.getByTestId("graph-gallery-open")).toBeFocused();expect((await workerState(page)).count).toBe(count);
  const identities=new Set<string>();
  for(const preset of getGraph2DPresetCatalog().entries) {
    await page.getByTestId("graph-gallery-open").click();await gallery.getByLabel("Search graphs").fill(preset.title);
    await gallery.getByRole("button",{name:`Open ${preset.title}`,exact:true}).click();await expect(gallery).not.toBeVisible();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    const doc=saved.entries.find((entry:{module:string})=>entry.module==="graph2d").checkpoint;
    expect(doc.source,preset.id).toEqual(preset.template.source);expect(doc.display).toEqual(preset.template.display);
    expect(doc.identity.id).not.toBe(preset.template.identity.id);expect(identities.has(doc.identity.id)).toBe(false);identities.add(doc.identity.id);
    for(const sidecar of preset.sidecars)expect(await page.evaluate(id=>JSON.parse(localStorage.getItem(`math3d.graph2d.table.${id}`)!),sidecar.id)).toEqual(sidecar.rows);
    for(const object of doc.source.objects) {
      const path=page.locator(`[data-graph2d-path="${object.id}"]`).first();await expect(path).toHaveAttribute("d",/[ML]/);
      expect(await path.getAttribute("d")).not.toMatch(/NaN|Infinity/);
    }
    if(preset.id==="strict-disk")await expect(page.locator('[data-boundary-strict="true"]')).toHaveCount(1);
    if(preset.id==="piecewise-data-gaps"){await expect(page.locator('[data-endpoint-open="true"]')).toHaveCount(1);await expect(page.locator('[data-row-id="row_3"]')).toHaveCount(0);}
    await expect.poll(async()=>(await workerState(page)).active).toBe(0);
    const request={document:{...preset.template,display:{...preset.template.display,sampling:{maxSamples:1024,maxDepth:12,tolerancePx:.75}}},
      viewport:preset.template.display.viewport,width:320,height:180,interaction:false,pointTables:Object.fromEntries(preset.sidecars.map((s:{id:string;rows:unknown})=>[s.id,s.rows])),timeBudgetMs:1500};
    const actual=await page.evaluate(({url,request})=>new Promise((resolveResult,reject)=>{
      const worker=new Worker(url,{type:"module"}),timeout=setTimeout(()=>{worker.terminate();reject(new Error("Gallery worker timeout"));},5000);
      worker.onmessage=event=>{clearTimeout(timeout);worker.terminate();event.data.error?reject(new Error(event.data.error)):resolveResult(event.data.series);};
      worker.onerror=()=>{clearTimeout(timeout);worker.terminate();reject(new Error("Gallery worker failed"));};worker.postMessage({jobId:"gallery-oracle",request});
    }),{url,request});
    comparePortable(actual,sampleGraph2DScene(request),preset.id);
    await page.getByTestId("main-viewer").screenshot({path:`output/graph2d-gallery/${info.project.name}-${preset.id}.png`});
  }
  await page.getByTestId("graph-gallery-open").click();await page.screenshot({path:`output/graph2d-gallery/${info.project.name}-gallery.png`});
  await page.setViewportSize({width:390,height:740});await expect.poll(async()=>(await workerState(page)).active).toBe(0);
  expect(await gallery.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:`output/graph2d-gallery/${info.project.name}-narrow.png`});
  await page.context().setOffline(true);await gallery.getByRole("button",{name:"All scenes",exact:true}).click();
  await expect(gallery.locator("article")).toHaveCount(20);
  await page.keyboard.press("Escape");await expect.poll(async()=>(await workerState(page)).active).toBe(0);
  await page.context().setOffline(false);
  const runtime=await page.evaluate(()=>({locale:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}));
  expect(runtime.locale).toBe(info.project.use.locale);expect(runtime.timezone).toBe(info.project.use.timezoneId);
});
