import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const protocol = require(path.join(root, "dist/main/python/nativeCgalProtocol.js"));
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return { app: { isPackaged: false } };
  return originalLoad.call(this, request, parent, isMain);
};
const { getNativeCgalWorker, stopNativeCgalWorker } = require(path.join(root, "dist/main/python/nativeCgalWorker.js"));
Module._load = originalLoad;

function readObj(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const original = [];
  const faces = [];
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      const xyz = line.slice(2).trim().split(/\s+/).slice(0, 3).map(Number);
      assert.equal(xyz.length, 3);
      assert.ok(xyz.every(Number.isFinite));
      original.push(xyz);
    } else if (line.startsWith("f ")) {
      const corners = line.slice(2).trim().split(/\s+/).map((corner) => Number(corner.split("/")[0]) - 1);
      assert.ok(corners.length >= 3 && corners.every((index) => Number.isInteger(index) && index >= 0));
      for (let i = 1; i + 1 < corners.length; i++) faces.push(corners[0], corners[i], corners[i + 1]);
    }
  }
  const coordinates = [], canonical = [], seen = new Map();
  for (const vertex of original) {
    const values = vertex.map(Math.fround);
    const key = values.join(",");
    let index = seen.get(key);
    if (index === undefined) {
      index = coordinates.length / 3;
      coordinates.push(...values);
      seen.set(key, index);
    }
    canonical.push(index);
  }
  const indices = new Uint32Array(faces.map((index) => {
    assert.ok(index < canonical.length);
    return canonical[index];
  }));
  return { positions: new Float32Array(coordinates), indices };
}

function translated(mesh, dx, dy, dz) {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += dx; positions[i + 1] += dy; positions[i + 2] += dz;
  }
  return { positions, indices: mesh.indices };
}

function bounds(mesh) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], mesh.positions[i + axis]);
      max[axis] = Math.max(max[axis], mesh.positions[i + axis]);
    }
  }
  return { min, max, span: max.map((value, axis) => value - min[axis]) };
}

function cutter(mesh) {
  const { min, max, span } = bounds(mesh);
  const c = min.map((value, axis) => (value + max[axis]) / 2);
  const h = Math.max(...span) * 0.125;
  const positions = new Float32Array([
    c[0]-h,c[1]-h,c[2]-h, c[0]+h,c[1]-h,c[2]-h,
    c[0]+h,c[1]+h,c[2]-h, c[0]-h,c[1]+h,c[2]-h,
    c[0]-h,c[1]-h,c[2]+h, c[0]+h,c[1]-h,c[2]+h,
    c[0]+h,c[1]+h,c[2]+h, c[0]-h,c[1]+h,c[2]+h,
  ]);
  const indices = new Uint32Array([
    0,2,1, 0,3,2, 4,5,6, 4,6,7,
    0,1,5, 0,5,4, 3,7,6, 3,6,2,
    0,4,7, 0,7,3, 1,2,6, 1,6,5,
  ]);
  return { positions, indices };
}

function inspectMesh(mesh) {
  const edgeBalance = new Map();
  let signedVolume = 0;
  const p = mesh.positions, ids = mesh.indices;
  for (let i = 0; i < ids.length; i += 3) {
    const a = ids[i], b = ids[i + 1], c = ids[i + 2];
    assert.ok(a < p.length / 3 && b < p.length / 3 && c < p.length / 3);
    assert.ok(a !== b && b !== c && a !== c, "degenerate triangle indices");
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = `${Math.min(u, v)}:${Math.max(u, v)}`;
      const previous = edgeBalance.get(key) ?? { count: 0, direction: 0 };
      previous.count++;
      previous.direction += u < v ? 1 : -1;
      edgeBalance.set(key, previous);
    }
    const ax=p[a*3], ay=p[a*3+1], az=p[a*3+2];
    const bx=p[b*3], by=p[b*3+1], bz=p[b*3+2];
    const cx=p[c*3], cy=p[c*3+1], cz=p[c*3+2];
    signedVolume += (ax*(by*cz-bz*cy) + ay*(bz*cx-bx*cz) + az*(bx*cy-by*cx)) / 6;
  }
  assert.ok([...edgeBalance.values()].every((edge) => edge.count === 2 && edge.direction === 0),
    "mesh is not an oriented closed manifold");
  assert.ok(Number.isFinite(signedVolume) && Math.abs(signedVolume) > 1e-9, "mesh has no finite volume");
  return { volume: Math.abs(signedVolume), faces: ids.length / 3, vertices: p.length / 3 };
}

function request(jobId, operation, a, b) {
  return {
    jobId, operation,
    positionsA: a.positions, indicesA: a.indices,
    positionsB: b.positions, indicesB: b.indices,
  };
}

async function waitForPending(worker, jobId, timeoutMs = 10_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const state = worker.snapshot();
    if (state.pendingJobId === jobId && state.pid) return state.pid;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Native CGAL job ${jobId} never reached the active process`);
}

const fandisk = readObj("tests/assets/meshes/standard/07_fandisk.obj");
const cow = readObj("tests/assets/meshes/standard/09_spot_cow.obj");
const bunny = readObj("tests/assets/meshes/standard/08_stanford_bunny.obj");
const fandiskBounds = bounds(fandisk);
const shiftedFandisk = translated(fandisk, fandiskBounds.span[0] * 0.12, fandiskBounds.span[1] * 0.05, 0);
const cowCutter = cutter(cow);
const fandiskVolume = inspectMesh(fandisk).volume;
const cowVolume = inspectMesh(cow).volume;
let worker = getNativeCgalWorker();
assert.ok(worker, "native CGAL worker must be built before release conformance");

try {
  const intersection = await worker.boolean(request("fandisk-intersection", "intersection", fandisk, shiftedFandisk));
  assert.equal(intersection.ok, true);
  assert.equal(intersection.boolean.kernel, "native-cgal");
  const intersectionInfo = inspectMesh({ positions: new Float32Array(intersection.positions), indices: new Uint32Array(intersection.indices) });
  assert.ok(intersectionInfo.volume > 0 && intersectionInfo.volume < fandiskVolume * 0.99);
  console.log(`Fandisk intersection: ${intersectionInfo.vertices} V / ${intersectionInfo.faces} F, volume ${intersectionInfo.volume.toFixed(3)}`);

  const difference = await worker.boolean(request("cow-difference", "difference", cow, cowCutter));
  assert.equal(difference.ok, true);
  assert.equal(difference.boolean.kernel, "native-cgal");
  const differenceInfo = inspectMesh({ positions: new Float32Array(difference.positions), indices: new Uint32Array(difference.indices) });
  assert.ok(differenceInfo.volume > 0 && differenceInfo.volume < cowVolume * 0.999);
  console.log(`Spot cow difference: ${differenceInfo.vertices} V / ${differenceInfo.faces} F, volume ${differenceInfo.volume.toFixed(3)}`);

  await assert.rejects(worker.boolean(request("open-bunny", "union", bunny, cowCutter)), /closed triangle meshes/);
  assert.equal(await worker.health(), true, "invalid geometry must not kill worker");

  const activeCrash = worker.boolean(request("crash-active", "intersection", fandisk, shiftedFandisk));
  const crashOutcome = activeCrash.then(() => "resolved", () => "rejected");
  const crashPid = await waitForPending(worker, "crash-active");
  const queuedAfterCrash = worker.boolean(request("after-crash", "difference", cow, cowCutter));
  process.kill(crashPid, "SIGKILL");
  assert.equal(await crashOutcome, "rejected", "crashed job must not publish a result");
  assert.equal((await queuedAfterCrash).ok, true, "queued job must restart worker after crash");
  assert.notEqual(worker.snapshot().pid, crashPid);
  console.log("Forced process crash: active job rejected, queued job restarted successfully.");

  const activeCancel = worker.boolean(request("cancel-active-release", "intersection", fandisk, shiftedFandisk));
  const cancelOutcome = activeCancel.then(() => "resolved", () => "rejected");
  const cancelPid = await waitForPending(worker, "cancel-active-release");
  const queuedCancel = worker.boolean(request("cancel-queued-release", "difference", cow, cowCutter));
  const queuedOutcome = queuedCancel.then(() => "resolved", () => "rejected");
  stopNativeCgalWorker();
  assert.equal(await cancelOutcome, "rejected");
  assert.equal(await queuedOutcome, "rejected");
  worker = getNativeCgalWorker();
  assert.ok(worker && await worker.health());
  assert.notEqual(worker.snapshot().pid, cancelPid);
  console.log("Cancellation: active and queued jobs rejected; fresh worker healthy.");
} finally {
  stopNativeCgalWorker();
}
