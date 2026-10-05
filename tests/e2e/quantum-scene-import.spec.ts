import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
  const scene = {
    schema: "quantum-scene/v1", id: "ipc-fixture", title: "IPC verified path",
    provenance: { runId: "run-ipc", jobId: "job-ipc", model: "two_level", engine: "native", engineVersion: "1",
      computedAt: "2026-10-05T00:00:00Z", resultSha256: "a".repeat(64), adapter: "qvis/1" },
    coordinates: { handedness: "right", axes: ["x","y","z"], units: ["dimensionless","dimensionless","dimensionless"] },
    camera: { position: [3,2,2], target: [0,0,0], up: [0,0,1] },
    datasets: [{ id: "vertices", path: "vertices.f64", format: "f64le", count: 2, components: 3,
      unit: "dimensionless", bytes: data.length, sha256: hash(data) }],
    objects: [{ id: "path", label: "Path", kind: "polyline", positions: "vertices", visible: true,
      style: { color: "#0088ff", opacity: 1, size: 1 } }], annotations: [],
  };
  const sceneBytes = Buffer.from(JSON.stringify(scene,null,2)+"\n");
  await writeFile(join(directory,"scene.json"),sceneBytes);
  await writeFile(join(directory,"vertices.f64"),data);
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
      expect(opened.deferredFieldIds).toEqual([]);
    }
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("run-ipc");
    await expect(page.getByTestId("quantum-scene-geometry")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeHidden();
    const damaged=Buffer.from(data);damaged[0]=1;await writeFile(join(directory,"vertices.f64"),damaged);
    const refused=await page.evaluate(()=>(window as any).quantumScenes.open());
    expect(refused).toMatchObject({ok:false,canceled:false});
    if(!refused.ok&&!refused.canceled)expect(refused.error).toMatch(/integrity/);
    const recentRefused=await page.evaluate(()=>(window as any).quantumScenes.reopenRecent());
    expect(recentRefused).toMatchObject({ok:false,canceled:false});
    if(!recentRefused.ok&&!recentRefused.canceled)expect(recentRefused.error).toMatch(/integrity/);

    const realBundle=resolve(__dirname,"..","fixtures","quantum-scene","run-97a132d1d712414bb62bb8c9212f517e-bands.qscene");
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},realBundle);
    await app.evaluate(({BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command",{command:"file:open-quantum-scene"});
    });
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("qwz");
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
