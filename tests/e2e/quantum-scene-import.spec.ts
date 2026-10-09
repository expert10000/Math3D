import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("desktop picker imports only a verified quantum scene and refuses tampering", async () => {
  test.setTimeout(300_000);
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
    await expect(page.getByTestId("quantum-source-directory")).toHaveText(directory);
    await app.evaluate(({shell})=>{
      const state=globalThis as any;
      state.__originalQuantumReveal=shell.showItemInFolder;
      state.__quantumRevealCount=0;
      (shell as any).showItemInFolder=(path:string)=>{state.__revealedQuantumSource=path;state.__quantumRevealCount++;};
    });
    await page.getByTestId("quantum-reveal-source").click();
    await expect(page.getByTestId("quantum-reveal-status")).toContainText("re-verified bundle");
    expect(await app.evaluate(()=> (globalThis as any).__revealedQuantumSource)).toBe(directory);
    expect(await app.evaluate(()=> (globalThis as any).__quantumRevealCount)).toBe(1);
    await page.getByRole("button",{name:"Field slice"}).click();
    await expect(page.getByTestId("quantum-field-slice")).toBeVisible();
    await expect(page.getByTestId("quantum-field-legend")).toContainText("a0^-3");
    const fieldCanvas=page.getByTestId("quantum-field-canvas");
    const fieldBounds=(await fieldCanvas.boundingBox())!;
    await fieldCanvas.click({position:{x:fieldBounds.width*.83,y:fieldBounds.height*.5}});
    await expect(page.getByTestId("quantum-field-sample")).toContainText("Grid [2, 1, 1]");
    await expect(page.getByTestId("quantum-field-sample")).toContainText("density = 1.000000");
    await page.getByTestId("quantum-scene-geometry").getByRole("button", { name: "Volume", exact: true }).click();
    await expect(page.getByTestId("quantum-volume-source")).toContainText("a0^-3");
    await expect(page.getByTestId("quantum-volume-source")).toContainText("f64le-planar-real-imaginary");
    await page.getByLabel("Volume quantity").selectOption("phase");
    await expect(page.getByTestId("quantum-volume-source")).toContainText("undefined phase");
    await expect(page.getByLabel("Volume view").locator("option[value=isosurface]")).toHaveCount(0);
    await page.getByLabel("Volume quantity").selectOption("density");
    await expect(page.getByTestId("quantum-volume-source")).toContainText("a0^-3");
    await page.getByLabel("Volume view").selectOption("isosurface");
    await expect(page.getByTestId("quantum-volume-source")).toContainText("threshold");
    await page.getByLabel("Volume view").selectOption("slice");
    const changedReal = Buffer.from(real); changedReal[0] ^= 1;
    await writeFile(join(directory, "real.f64"), changedReal);
    await page.getByLabel("Volume quantity").selectOption("imaginary");
    await expect(page.getByTestId("quantum-field-volume").getByRole("status")).toContainText("integrity");
    await writeFile(join(directory, "real.f64"), real);
    await page.getByLabel("Volume quantity").selectOption("density");
    await expect(page.getByTestId("quantum-volume-source")).toContainText("a0^-3");
    const cancellation = await page.evaluate(async fingerprint => {
      const api = (window as any).quantumScenes;
      const requestId = crypto.randomUUID();
      const pending = api.fieldVolume({ fingerprint, fieldId: "wavefunction", quantity: "density", requestId })
        .then(() => "published", (error: unknown) => String(error));
      const canceled = await api.cancelFieldVolume(requestId);
      return { canceled, result: await pending };
    }, (opened as { ok: true; reference: { sceneFingerprint: string } }).reference.sceneFingerprint);
    expect(cancellation.canceled).toBe(true);
    expect(cancellation.result).toMatch(/cancelled/);
    await page.getByTestId("quantum-scene-geometry").getByRole("button",{name:"Geometry",exact:true}).click();
    await expect(page.getByTestId("quantum-field-slice")).toHaveCount(0);
    const wrongField=await page.evaluate(async()=>{
      try {await (window as any).quantumScenes.fieldSlice({fingerprint:"0".repeat(64),fieldId:"wavefunction",axis:2,index:1,quantity:"density"});return "accepted";}
      catch(error){return String(error);}
    });
    expect(wrongField).toMatch(/does not match the active verified scene/);
    const wrongReveal=await page.evaluate(()=>(window as any).quantumScenes.revealSource("0".repeat(64)));
    expect(wrongReveal).toMatchObject({ok:false});
    await page.getByTestId("quantum-scene-close").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeHidden();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await expect(projects.getByTestId("project-quantum-scenes")).toBeVisible();
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("staged");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const projectScene = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    expect(projectScene).toMatchObject({ format: "quantum-scene/v1", directory, sceneFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    await projects.getByTestId(`project-admit-quantum-scene-${projectScene.sceneFingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Project contents");
    await expect(projects.getByTestId("project-group-quantum")).toContainText("IPC verified path");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries.some((item: any) => item.module === "quantum")),
      { timeout: 60_000 }).toBe(true);
    const savedQuantum = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      return { projectId: project.identity.id, entry: project.workspace.entries.find((item: any) => item.module === "quantum") };
    });
    expect(savedQuantum.entry).toMatchObject({ module: "quantum", replay: null,
      checkpoint: { format: "math3d.quantum-scene-document", source: { sceneSchema: "quantum-scene/v1", sceneFingerprint: projectScene.sceneFingerprint,
        provenance: { runId: "run-ipc", resultSha256: "a".repeat(64) }, datasets: expect.arrayContaining([{ id: "vertices", sha256: hash(data), bytes: 48, count: 2, components: 3, unit: "dimensionless" }]) },
        location: { directory } } });
    expect(JSON.stringify(savedQuantum.entry)).not.toContain("vertices.f64");
    const relocated = join(root, "relocated.qscene");
    await cp(directory, relocated, { recursive: true });
    const savedBeforeRelink = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const relink = projects.getByTestId(`project-relink-quantum-scene-${projectScene.sceneFingerprint}`);
    await app.evaluate(({dialog}) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await relink.click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Relink canceled; Project unchanged");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(savedBeforeRelink);
    const otherBundle = resolve(__dirname, "..", "fixtures", "quantum-scene-orbitals", "orbital-2p.qscene");
    await app.evaluate(({dialog}, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, otherBundle);
    await relink.click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("does not match the saved scene fingerprint");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(savedBeforeRelink);
    const damagedCandidate = Buffer.from(data); damagedCandidate[0] = 1;
    await writeFile(join(relocated, "vertices.f64"), damagedCandidate);
    await app.evaluate(({dialog}, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, relocated);
    await relink.click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText(/Relink refused:.*integrity/);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(savedBeforeRelink);
    await writeFile(join(relocated, "vertices.f64"), data);
    await relink.click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Save project to retain the relink");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(savedBeforeRelink);
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]?.directory),
      { timeout: 60_000 }).toBe(relocated);
    const relocatedProjectScene = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    expect(relocatedProjectScene).toMatchObject({ directory: relocated, sceneFingerprint: projectScene.sceneFingerprint });
    const portableProject = Buffer.from(await page.evaluate(() => localStorage.getItem("math3d.project.v1")!));
    const relinkedQuantum = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries.find((item: any) => item.module === "quantum"));
    expect(relinkedQuantum.expected).toEqual(savedQuantum.entry.expected);
    expect(relinkedQuantum.checkpoint.location.directory).toBe(relocated);
    await projects.getByTestId(`project-open-saved-${savedQuantum.projectId}`).click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    await projects.getByRole("button", { name: "Project details" }).click();
    await expect(projects.getByTestId(`project-view-${savedQuantum.entry.expected.id}`)).toBeEnabled();
    await projects.getByTestId(`project-view-${savedQuantum.entry.expected.id}`).click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("run-ipc");
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByRole("button", { name: "Project details" }).click();
    await projects.getByTestId("project-import-file").setInputFiles({ name: "quantum-project.json", mimeType: "application/json", buffer: portableProject });
    await expect(projects.getByTestId("project-import-open")).toBeEnabled();
    await projects.getByTestId("project-import-open").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    await page.getByTestId("quantum-scene-preview").waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
    if (await page.getByTestId("quantum-scene-preview").isVisible()) await page.getByTestId("quantum-scene-close").click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries.find((item: any) => item.module === "quantum")?.expected.id))
      .toBe(savedQuantum.entry.expected.id);
    await projects.getByTestId(`project-open-quantum-scene-${projectScene.sceneFingerprint}`).click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await projects.getByRole("button", { name: "Close project explorer" }).click();
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
    expect(workspace.payload.quantumScene).toMatchObject({directory:relocated,sceneFingerprint:expect.stringMatching(/^[a-f0-9]{64}$/)});
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
    await page.getByTestId("quantum-reveal-source").click();
    await expect(page.getByTestId("quantum-reveal-status")).toContainText("re-verified bundle");
    expect(await app.evaluate(()=> (globalThis as any).__quantumRevealCount)).toBe(2);
    await page.getByRole("button",{name:"Field slice"}).click();
    await expect(page.getByTestId("quantum-field-legend")).toContainText("a0^-3");
    await page.getByTestId("quantum-scene-close").click();
    const damaged=Buffer.from(data);damaged[0]=1;await writeFile(join(directory,"vertices.f64"),damaged);
    await writeFile(join(relocated,"vertices.f64"),damaged);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-workspace"});
    });
    await expect(page.getByText(/Workspace quantum scene could not reopen:.*integrity/)).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toBeHidden();
    const referenceRefused=await page.evaluate(ref=>(window as any).quantumScenes.openReference(ref),workspace.payload.quantumScene);
    expect(referenceRefused).toMatchObject({ok:false,canceled:false});
    if(!referenceRefused.ok&&!referenceRefused.canceled)expect(referenceRefused.error).toMatch(/integrity/);
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId(`project-open-quantum-scene-${projectScene.sceneFingerprint}`).click();
    await expect(page.getByTestId("project-quantum-scene-message")).toContainText(/Scene unavailable:.*integrity/);
    await expect(page.getByTestId("quantum-scene-preview")).toBeHidden();
    const activeBeforeRefusal = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await page.getByTestId(`project-open-saved-${savedQuantum.projectId}`).click();
    await expect(page.getByTestId("project-message")).toContainText(/Project import failed:.*integrity/);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(activeBeforeRefusal);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},directory);
    const refused=await page.evaluate(()=>(window as any).quantumScenes.open());
    expect(refused).toMatchObject({ok:false,canceled:false});
    if(!refused.ok&&!refused.canceled)expect(refused.error).toMatch(/integrity/);
    const recentRefused=await page.evaluate(()=>(window as any).quantumScenes.reopenRecent());
    expect(recentRefused).toMatchObject({ok:false,canceled:false});
    if(!recentRefused.ok&&!recentRefused.canceled)expect(recentRefused.error).toMatch(/integrity/);
    const damagedReveal=await page.evaluate(ref=>(window as any).quantumScenes.revealSource(ref.sceneFingerprint),workspace.payload.quantumScene);
    expect(damagedReveal).toMatchObject({ok:false,error:expect.stringMatching(/integrity/)});
    expect(await app.evaluate(()=> (globalThis as any).__revealedQuantumSource)).toBe(relocated);
    expect(await app.evaluate(()=> (globalThis as any).__quantumRevealCount)).toBe(2);
    await app.evaluate(({shell})=>{
      const state=globalThis as any;
      (shell as any).showItemInFolder=state.__originalQuantumReveal;
      delete state.__originalQuantumReveal;
      delete state.__revealedQuantumSource;
      delete state.__quantumRevealCount;
    });

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
    await restartedPage.getByTestId("projects-toggle").click();
    await expect(restartedPage.getByTestId(`project-open-quantum-scene-${projectScene.sceneFingerprint}`)).toBeVisible();
    expect(await restartedPage.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0].directory)).toBe(relocated);
    await restartedPage.getByTestId(`project-open-quantum-scene-${projectScene.sceneFingerprint}`).click();
    await expect(restartedPage.getByTestId("project-quantum-scene-message")).toContainText(/Scene unavailable:.*integrity/);
    await expect(restartedPage.getByTestId("quantum-scene-preview")).toBeHidden();
    const recovered = join(root, "recovered.qscene");
    await cp(relocated, recovered, { recursive: true });
    await writeFile(join(recovered, "vertices.f64"), data);
    const activeBeforeRecovery = await restartedPage.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await restartedPage.getByTestId(`project-preview-${savedQuantum.projectId}`).click();
    const previewRelink = restartedPage.getByTestId(`project-relink-quantum-scene-${projectScene.sceneFingerprint}`);
    await expect(previewRelink).toBeEnabled();
    await app.evaluate(({dialog}, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, recovered);
    await previewRelink.click();
    await expect(restartedPage.getByTestId("project-quantum-scene-message")).toContainText("saved Project");
    expect(await restartedPage.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(activeBeforeRecovery);
    expect(await restartedPage.evaluate(id => JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${id}`)!).quantumScenes[0].directory, savedQuantum.projectId)).toBe(recovered);
    await restartedPage.getByTestId(`project-open-saved-${savedQuantum.projectId}`).click();
    await expect(restartedPage.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    expect(await restartedPage.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries.find((item: any) => item.module === "quantum").checkpoint.location.directory)).toBe(recovered);
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

test("verified site and link selection survives restart and refuses a changed bundle", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qscene-sites-"));
  const directory = join(root, "sites.qscene");
  await mkdir(directory);
  const bytes = Buffer.alloc(6 * 8);
  [0, 0, 0, 2, 0, 0].forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  const scene = {
    schema: "quantum-scene/v1", id: "site-link-fixture", title: "Verified site/link scene",
    provenance: { runId: "run-sites", jobId: "job-sites", model: "supplied_geometry", engine: "native",
      engineVersion: "1", computedAt: "2026-10-05T00:00:00Z", resultSha256: "b".repeat(64), adapter: "qvis/1" },
    coordinates: { handedness: "right", axes: ["x", "y", "z"], units: ["a0", "a0", "a0"] },
    camera: { position: [1, 2, 5], target: [1, 0, 0], up: [0, 1, 0] },
    datasets: ["sites", "links"].map(id => ({ id, path: `${id}.f64`, format: "f64le", count: 2,
      components: 3, unit: "a0", bytes: bytes.length, sha256: hash(bytes) })),
    objects: [
      { id: "site-object", label: "Supplied centers", kind: "point-cloud", positions: "sites", visible: true,
        style: { color: "#22aaff", opacity: 1, size: 2 } },
      { id: "link-object", label: "Supplied connection", kind: "segments", positions: "links", visible: true,
        style: { color: "#ff8800", opacity: 1, size: 2 } },
    ], annotations: [],
  };
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n");
  await writeFile(join(directory, "scene.json"), sceneBytes);
  await writeFile(join(directory, "sites.f64"), bytes);
  await writeFile(join(directory, "links.f64"), bytes);
  await writeFile(join(directory, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: sceneBytes.length, sha256: hash(sceneBytes) } }, null, 2) + "\n");
  const target = join(root, "fake-theory-lab"), capture = join(root, "source-run-launches.jsonl");
  const sourceDist = resolve(__dirname, "..", "..", "node_modules", "electron", "dist");
  const linkedDist = join(target, "node_modules", "electron", "dist");
  await mkdir(join(target, "dist"), { recursive: true });
  await mkdir(join(target, "node_modules", "electron"), { recursive: true });
  await writeFile(join(target, "package.json"), JSON.stringify({ name: "theory-lab", main: "dist/main.cjs" }));
  await writeFile(join(target, "dist", "main.cjs"),
    "require('node:fs').appendFileSync(process.env.MATH3D_LAB_CAPTURE, JSON.stringify({argv:process.argv}) + '\\n'); process.exit(0);\n");
  await writeFile(join(target, "dist", "preload.cjs"), "\n");
  await writeFile(join(target, "dist", "index.html"), "<!doctype html>\n");
  const linkedDistIsSymlink = await symlink(sourceDist, linkedDist, process.platform === "win32" ? "junction" : "dir")
    .then(() => true, async () => { await cp(sourceDist, linkedDist, { recursive: true }); return false; });
  const launch = (args = [".", "--quantum-scene", directory]) => launchRepoElectron({ args,
    cwd: resolve(__dirname, "..", ".."), env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile"),
      MATH3D_THEORY_LAB_HOME: target, MATH3D_LAB_CAPTURE: capture } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-primitive-objects")).toContainText("site-object");
    await expect(page.getByTestId("quantum-primitive-objects")).toContainText("link-object");
    await expect(page.getByTestId("quantum-scene-geometry").getByTestId("surface-viewer-canvas-host"))
      .toHaveAttribute("data-rendered-mesh-count", "2");
    const canvas = page.getByTestId("quantum-scene-geometry").locator("canvas").first();
    const box = (await canvas.boundingBox())!;
    for (const x of [0.35, 0.65, 0.5, 0.25, 0.75]) {
      if (await page.getByTestId("quantum-primitive-selection").isVisible()) break;
      await canvas.click({ position: { x: box.width * x, y: box.height * 0.5 } });
    }
    await expect(page.getByTestId("quantum-primitive-selection")).toContainText(/site-object|link-object/);
    await expect(page.getByTestId("quantum-primitive-selection")).toContainText("a0");
    await page.getByRole("button", { name: "Inspect first sample of site-object" }).click();
    await expect(page.getByTestId("quantum-primitive-selection")).toContainText("Selected site");
    await expect(page.getByTestId("quantum-primitive-selection")).toContainText("site-object");
    await page.getByRole("button", { name: "Inspect first sample of link-object" }).click();
    await expect(page.getByTestId("quantum-primitive-selection")).toContainText("Selected link");
    await expect(page.getByTestId("quantum-primitive-selection")).toContainText("Endpoints");
    const wrongSource = await page.evaluate(() => (window as any).quantumScenes.openSourceRun("0".repeat(64)));
    expect(wrongSource).toMatchObject({ ok: false });
    await page.getByTestId("quantum-open-source-run").click();
    await expect(page.getByTestId("quantum-source-run-status")).toContainText("Lab will verify the exact saved result");
    await expect.poll(async () => { try { return (await stat(capture)).size > 0; } catch { return false; } }).toBe(true);
    const launches = async () => (await readFile(capture, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const [firstLaunch] = await launches();
    const flag = firstLaunch.argv.indexOf("--quantum-source-run");
    expect(firstLaunch.argv.slice(flag + 1, flag + 3)).toEqual(["run-sites", "b".repeat(64)]);
    const alteredBeforeLaunch = Buffer.from(bytes); alteredBeforeLaunch[0] ^= 1;
    await writeFile(join(directory, "sites.f64"), alteredBeforeLaunch);
    await page.getByTestId("quantum-open-source-run").click();
    await expect(page.getByTestId("quantum-source-run-status")).toContainText(/integrity|changed/);
    expect((await launches()).length).toBe(1);
    await writeFile(join(directory, "sites.f64"), bytes);
    await app.close();
    app = await launch(["."]);
    page = await app.firstWindow();
    await expect.poll(() => page.evaluate(() => typeof (window as any).quantumScenes?.reopenRecent)).toBe("function");
    const reopened = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(reopened).toMatchObject({ ok: true, remembered: true, mappedObjectIds: ["site-object", "link-object"] });
    const altered = Buffer.from(bytes); altered[0] ^= 1;
    await writeFile(join(directory, "sites.f64"), altered);
    const refused = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(refused).toMatchObject({ ok: false });
    expect(refused.error).toMatch(/integrity/);
  } finally {
    await app.close();
    const safeRoot = resolve(root);
    if (!safeRoot.startsWith(resolve(tmpdir()) + sep) || !safeRoot.includes("m3d-qscene-sites-"))
      throw new Error("Unsafe site/link E2E cleanup path");
    if (linkedDistIsSymlink) await unlink(linkedDist);
    await rm(safeRoot, { recursive: true, force: true });
  }
});
