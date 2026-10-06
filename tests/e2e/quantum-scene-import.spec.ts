import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("desktop picker imports only a verified quantum scene and refuses tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "m3d-qscene-ipc-"));
  const directory = join(root, "sample.qscene");
  await mkdir(directory);
  const data = Buffer.alloc(48);
  [0,0,0,1,0,0].forEach((value,index) => data.writeDoubleLE(value,index * 8));
  const fieldData = (sample: (x: number, y: number) => number) => {
    const bytes = Buffer.alloc(27 * 8);
    let offset = 0;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)bytes.writeDoubleLE(sample(x,y),offset++*8);
    return bytes;
  };
  const real = fieldData((x)=>x), imaginary = fieldData((_x,y)=>y);
  const scene = {
    schema: "quantum-scene/v1", id: "ipc-fixture", title: "IPC verified path",
    provenance: { runId: "run-ipc", jobId: "job-ipc", model: "two_level", engine: "native", engineVersion: "1",
      computedAt: "2026-10-05T00:00:00Z", resultSha256: "a".repeat(64), adapter: "qvis/1" },
    coordinates: { handedness: "right", axes: ["x","y","z"], units: ["dimensionless","dimensionless","dimensionless"] },
    camera: { position: [3,2,2], target: [0,0,0], up: [0,0,1] },
    datasets: [{ id: "vertices", path: "vertices.f64", format: "f64le", count: 2, components: 3,
      unit: "dimensionless", bytes: data.length, sha256: hash(data) },
    ...[["real",real],["imaginary",imaginary]].map(([id,bytes])=>({id,path:`${id}.f64`,format:"f64le",count:27,components:1,
      unit:"a0^-3/2",bytes:(bytes as Buffer).length,sha256:hash(bytes as Buffer)}))],
    objects: [{ id: "path", label: "Path", kind: "polyline", positions: "vertices", visible: true,
      style: { color: "#0088ff", opacity: 1, size: 1 } }], annotations: [],
    fields: [{id:"wavefunction",label:"Synthetic orbital field",kind:"complex-field",real:"real",imaginary:"imaginary",
      grid:{shape:[3,3,3],origin:[-1,-1,-1],spacing:[1,1,1],order:"xyz-z-fastest"}}],
  };
  const sceneBytes = Buffer.from(JSON.stringify(scene,null,2)+"\n");
  await writeFile(join(directory,"scene.json"),sceneBytes);
  await writeFile(join(directory,"vertices.f64"),data);
  await writeFile(join(directory,"real.f64"),real);
  await writeFile(join(directory,"imaginary.f64"),imaginary);
  await writeFile(join(directory,"bundle.json"),JSON.stringify({schema:"quantum-scene-bundle/v1",
    scene:{path:"scene.json",bytes:sceneBytes.length,sha256:hash(sceneBytes)}},null,2)+"\n");
  const launch = (args = ["."]) => launchRepoElectron({ args, cwd:resolve(__dirname,"..",".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    const fileActions=await app.evaluate(({Menu})=>Menu.getApplicationMenu()?.items
      .find(item=>item.label==="File")?.submenu?.items.map(item=>item.label)??[]);
    expect(fileActions).toContain("Open verified quantum scene...");
    expect(fileActions).toContain("Reopen recent quantum scene");
    await expect.poll(()=>page.evaluate(()=>typeof (window as any).quantumScenes?.open)).toBe("function");
    await expect.poll(()=>page.evaluate(()=>typeof (window as any).quantumScenes?.reopenRecent)).toBe("function");
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},directory);
    const opened = await page.evaluate(()=>(window as any).quantumScenes.open());
    expect(opened.ok).toBe(true);
    if(opened.ok){
      expect(opened.remembered).toBe(true);
      expect(opened.document).toMatchObject({title:"IPC verified path",metadata:{sourceResultSha256:"a".repeat(64)}});
      expect(opened.mappedObjectIds).toEqual(["path"]);
      expect(opened.deferredFieldIds).toEqual(["wavefunction"]);
    }
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("run-ipc");
    await expect(page.getByTestId("quantum-scene-geometry")).toBeVisible();
    await page.getByRole("button",{name:"Field slice"}).click();
    await expect(page.getByTestId("quantum-field-slice")).toBeVisible();
    await expect(page.getByTestId("quantum-field-legend")).toContainText("a0^-3");
    const fieldCanvas=page.getByTestId("quantum-field-canvas");
    const fieldBounds=(await fieldCanvas.boundingBox())!;
    await fieldCanvas.click({position:{x:fieldBounds.width*.83,y:fieldBounds.height*.5}});
    await expect(page.getByTestId("quantum-field-sample")).toContainText("Grid [2, 1, 1]");
    await expect(page.getByTestId("quantum-field-sample")).toContainText("density = 1.000000");
    await page.getByTestId("quantum-scene-geometry").getByRole("button",{name:"Geometry",exact:true}).click();
    await expect(page.getByTestId("quantum-field-slice")).toHaveCount(0);
    const wrongField=await page.evaluate(async()=>{
      try {await (window as any).quantumScenes.fieldSlice({fingerprint:"0".repeat(64),fieldId:"wavefunction",axis:2,index:1,quantity:"density"});return "accepted";}
      catch(error){return String(error);}
    });
    expect(wrongField).toMatch(/does not match the active verified scene/);
    await page.getByTestId("quantum-scene-close").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeHidden();
    const workspacePath = join(root, "quantum-workspace.math3d");
    await page.evaluate(() => {
      const capture = window as any;
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { capture.__savedWorkspaceBlob = blob; return create(blob); };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download.endsWith(".math3d")) { capture.__savedWorkspaceName = this.download; return; }
        click.call(this);
      };
    });
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:save-workspace"});
    });
    await expect.poll(()=>page.evaluate(()=>(window as any).__savedWorkspaceName)).toMatch(/\.math3d$/);
    await writeFile(workspacePath, await page.evaluate(async () => (window as any).__savedWorkspaceBlob.text()));
    const workspace = JSON.parse(await readFile(workspacePath,"utf8"));
    expect(workspace.payload.quantumScene).toMatchObject({directory,sceneFingerprint:expect.stringMatching(/^[a-f0-9]{64}$/)});
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:new-workspace"});
    });
    await app.evaluate(({dialog},file)=>{
      (dialog as any).showOpenDialog=async (_window:unknown,options:{properties?:string[]})=>{
        if (!options.properties?.includes("openFile")) throw new Error("Workspace must use the native file picker");
        return {canceled:false,filePaths:[file]};
      };
    },workspacePath);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-workspace"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("run-ipc");
    await page.getByRole("button",{name:"Field slice"}).click();
    await expect(page.getByTestId("quantum-field-legend")).toContainText("a0^-3");
    await page.getByTestId("quantum-scene-close").click();
    const damaged=Buffer.from(data);damaged[0]=1;await writeFile(join(directory,"vertices.f64"),damaged);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-workspace"});
    });
    await expect(page.getByText(/Workspace quantum scene could not reopen:.*integrity/)).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toBeHidden();
    const referenceRefused=await page.evaluate(ref=>(window as any).quantumScenes.openReference(ref),workspace.payload.quantumScene);
    expect(referenceRefused).toMatchObject({ok:false,canceled:false});
    if(!referenceRefused.ok&&!referenceRefused.canceled)expect(referenceRefused.error).toMatch(/integrity/);
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},directory);
    const refused=await page.evaluate(()=>(window as any).quantumScenes.open());
    expect(refused).toMatchObject({ok:false,canceled:false});
    if(!refused.ok&&!refused.canceled)expect(refused.error).toMatch(/integrity/);
    const recentRefused=await page.evaluate(()=>(window as any).quantumScenes.reopenRecent());
    expect(recentRefused).toMatchObject({ok:false,canceled:false});
    if(!recentRefused.ok&&!recentRefused.canceled)expect(recentRefused.error).toMatch(/integrity/);

    const fieldOnly=join(root,"field-only.qscene");
    await mkdir(fieldOnly);
    const fieldScene={...scene,id:"field-only",title:"Verified field-only scene",objects:[],
      provenance:{...scene.provenance,runId:"run-field-only",model:"synthetic_field"},
      datasets:scene.datasets.filter(dataset=>dataset.id!=="vertices")};
    const fieldSceneBytes=Buffer.from(JSON.stringify(fieldScene,null,2)+"\n");
    await writeFile(join(fieldOnly,"scene.json"),fieldSceneBytes);
    await writeFile(join(fieldOnly,"real.f64"),real);
    await writeFile(join(fieldOnly,"imaginary.f64"),imaginary);
    await writeFile(join(fieldOnly,"bundle.json"),JSON.stringify({schema:"quantum-scene-bundle/v1",
      scene:{path:"scene.json",bytes:fieldSceneBytes.length,sha256:hash(fieldSceneBytes)}},null,2)+"\n");
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},fieldOnly);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("Verified field-only scene");
    await expect(page.getByTestId("quantum-field-slice")).toBeVisible();
    await page.getByRole("combobox",{name:"Quantum field quantity"}).selectOption("phase");
    await expect(page.getByTestId("quantum-field-legend")).toContainText("rad");
    expect(await page.getByTestId("quantum-field-canvas").evaluate(canvas=>(canvas as HTMLCanvasElement)
      .getContext("2d")!.getImageData(1,1,1,1).data[3])).toBe(0);
    await page.getByTestId("quantum-scene-close").click();

    const orbitalBundle=resolve(__dirname,"..","fixtures","quantum-scene-orbitals","orbital-2p.qscene");
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},orbitalBundle);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("hydrogenic");
    await expect(page.getByTestId("quantum-scene-parameters")).toContainText("basis");
    await expect(page.getByTestId("quantum-scene-parameters")).toContainText("complex");
    await expect(page.getByTestId("quantum-field-slice")).toBeVisible();
    await expect(page.getByTestId("quantum-field-legend")).toContainText("a0^-3");
    await page.getByRole("combobox",{name:"Quantum field quantity"}).selectOption("phase");
    const orbitalCanvas=page.getByTestId("quantum-field-canvas");
    const orbitalBounds=(await orbitalCanvas.boundingBox())!;
    await orbitalCanvas.click({position:{x:orbitalBounds.width*.5,y:orbitalBounds.height*.5}});
    await expect(page.getByTestId("quantum-field-sample")).toContainText("undefined near a node");
    await page.getByRole("button",{name:"Density surface"}).click();
    await expect(page.getByTestId("quantum-field-surface")).toBeVisible();
    await expect(page.getByTestId("quantum-surface-legend")).toContainText("a0^-3");
    await expect(page.getByTestId("quantum-surface-legend")).toContainText("10% of sampled maximum");
    await expect(page.getByTestId("quantum-field-surface").locator("canvas").first()).toBeVisible();
    await page.getByRole("combobox",{name:"Quantum surface threshold"}).selectOption("0.2");
    await expect(page.getByTestId("quantum-surface-legend")).toContainText("20% of sampled maximum");
    await page.getByRole("combobox",{name:"Quantum surface color"}).selectOption("phase");
    await expect(page.getByTestId("quantum-surface-color-counts")).toContainText("8 phase color bins");
    await expect(page.getByTestId("quantum-field-surface").getByTestId("surface-viewer-canvas-host"))
      .toHaveAttribute("data-rendered-mesh-count","8");
    await page.getByRole("combobox",{name:"Quantum surface color"}).selectOption("real-sign");
    await expect(page.getByTestId("quantum-surface-color-counts")).toContainText("2 real-sign color bins");
    await expect(page.getByTestId("quantum-field-surface").getByTestId("surface-viewer-canvas-host"))
      .toHaveAttribute("data-rendered-mesh-count","2");
    const orbitalReference=await page.evaluate(async()=>{
      const opened=await (window as any).quantumScenes.reopenRecent();
      return opened.ok ? opened.reference : null;
    });
    expect(orbitalReference).not.toBeNull();
    if(!orbitalReference)throw new Error("Orbital reference was not remembered");
    await page.getByTestId("quantum-scene-close").click();

    const radialBundle=resolve(__dirname,"..","fixtures","quantum-scene-orbitals","orbital-2s.qscene");
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},radialBundle);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("hydrogenic");
    await page.getByRole("button",{name:"Density surface"}).click();
    await page.getByRole("combobox",{name:"Quantum surface threshold"}).selectOption("0.01");
    await page.getByRole("combobox",{name:"Quantum surface color"}).selectOption("real-sign");
    await expect(page.getByTestId("quantum-surface-color-counts")).toContainText("2 real-sign color bins");
    await page.getByTestId("quantum-scene-close").click();

    const realBundle=resolve(__dirname,"..","fixtures","quantum-scene","run-97a132d1d712414bb62bb8c9212f517e-bands.qscene");
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},realBundle);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("qwz");
    const staleSurfaceRequest=await page.evaluate(async fingerprint=>{
      try { await (window as any).quantumScenes.fieldSurface({fingerprint,fieldId:"wavefunction",level:0.1});return "accepted"; }
      catch(error){return String(error);}
    },orbitalReference.sceneFingerprint);
    expect(staleSurfaceRequest).toMatch(/active verified scene/);
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("rad / lattice constant");
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("normalized energy (hbar=1)");
    await expect(page.getByTestId("quantum-band-legend")).toContainText("Lower band");
    await expect(page.getByTestId("quantum-band-legend")).toContainText("Upper band");
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("Supplied bulk gap: 2");
    const canvas = page.getByTestId("quantum-scene-geometry").locator("canvas").first();
    await expect(canvas).toBeVisible();
    const bounds = (await canvas.boundingBox())!;
    const samples = [.3, .45, .6, .7].flatMap(x => [.25, .4, .55, .7].map(y => ({
      x: bounds.width * x, y: bounds.height * y,
    })));
    for (const position of samples) {
      await canvas.click({ position });
      if (await page.getByTestId("quantum-band-selection").count()) break;
    }
    await expect(page.getByTestId("quantum-band-selection")).toContainText("band-");
    await page.getByTestId("quantum-scene-close").click();
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:reopen-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("qwz");
    await app.close();
    app = await launch();
    const restartedPage = await app.firstWindow();
    await restartedPage.waitForLoadState("domcontentloaded");
    await expect.poll(()=>restartedPage.evaluate(()=>typeof (window as any).quantumScenes?.reopenRecent)).toBe("function");
    const reopenedAfterRestart = await restartedPage.evaluate(()=>(window as any).quantumScenes.reopenRecent());
    expect(reopenedAfterRestart).toMatchObject({ok:true,remembered:true});
    if(reopenedAfterRestart.ok)expect(reopenedAfterRestart.document.metadata.sourceModel).toBe("qwz");
    await app.close();
    app = await launch([".", "--quantum-scene", realBundle]);
    const launchedPage = await app.firstWindow();
    await launchedPage.waitForLoadState("domcontentloaded");
    await expect(launchedPage.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(launchedPage.getByTestId("quantum-scene-preview")).toContainText("QWZ supplied energy bands");
  } finally {
    await app.close();
    const safeRoot = resolve(root);
    if (!safeRoot.startsWith(resolve(tmpdir()) + sep) || !safeRoot.includes("m3d-qscene-ipc-"))
      throw new Error("Unsafe quantum-scene E2E cleanup path");
    await rm(safeRoot,{recursive:true,force:true});
  }
});
