import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  const app = await launchRepoElectron({ args:["."], cwd:resolve(__dirname,"..","..") });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(()=>page.evaluate(()=>typeof (window as any).quantumScenes?.open)).toBe("function");
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},directory);
    const opened = await page.evaluate(()=>(window as any).quantumScenes.open());
    expect(opened.ok).toBe(true);
    if(opened.ok){
      expect(opened.document).toMatchObject({title:"IPC verified path",metadata:{sourceResultSha256:"a".repeat(64)}});
      expect(opened.mappedObjectIds).toEqual(["path"]);
      expect(opened.deferredFieldIds).toEqual([]);
    }
    const damaged=Buffer.from(data);damaged[0]=1;await writeFile(join(directory,"vertices.f64"),damaged);
    const refused=await page.evaluate(()=>(window as any).quantumScenes.open());
    expect(refused).toMatchObject({ok:false,canceled:false});
    if(!refused.ok&&!refused.canceled)expect(refused.error).toMatch(/integrity/);
  } finally {
    await app.close();
    await rm(root,{recursive:true,force:true});
  }
});
