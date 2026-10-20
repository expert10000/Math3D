import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const protocol = require(path.join(root, "dist/main/python/nativeCgalProtocol.js"));
const executable = process.env.MATH3D_CGAL_NATIVE_EXE || path.join(root, "build/native/cgal-worker/Release", process.platform === "win32" ? "math3d-cgal-worker.exe" : "math3d-cgal-worker");
const cubeIndices = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
  0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);
function cube(dx, dy, dz, scale = 1, indices = cubeIndices) {
  const values = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  return protocol.encodeM3DMesh(new Float32Array(values.flatMap(([x, y, z]) => [x * scale + dx, y * scale + dy, z * scale + dz])), indices);
}

function meshGeometry(mesh) {
  const positions = new Float32Array(mesh.positions);
  const indices = new Uint32Array(mesh.indices);
  const bounds = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis++) {
      bounds[2 * axis] = Math.min(bounds[2 * axis], positions[offset + axis]);
      bounds[2 * axis + 1] = Math.max(bounds[2 * axis + 1], positions[offset + axis]);
    }
  }
  let sixTimesVolume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ai = 3 * indices[offset], bi = 3 * indices[offset + 1], ci = 3 * indices[offset + 2];
    const ax = positions[ai], ay = positions[ai + 1], az = positions[ai + 2];
    const bx = positions[bi], by = positions[bi + 1], bz = positions[bi + 2];
    const cx = positions[ci], cy = positions[ci + 1], cz = positions[ci + 2];
    sixTimesVolume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return { volume: sixTimesVolume / 6, bounds };
}

async function assertBooleanCase(name, operation, a, b, expectedVolume, expectedBounds) {
  const response = await send(3, name, a, b, operation);
  assert.equal(response.ok, true, `${name}: ${response.message}`);
  assert.equal(response.message, "native-cgal", `${name}: unexpected kernel`);
  const mesh = protocol.decodeM3DMesh(response.mesh);
  const actual = meshGeometry(mesh);
  const tolerance = 1e-5;
  assert.ok(Math.abs(actual.volume - expectedVolume) <= tolerance,
    `${name}: volume ${actual.volume}, expected ${expectedVolume}`);
  if (expectedBounds === null) {
    assert.equal(mesh.triCount, 0, `${name}: a zero-volume solid must have no triangles`);
  } else {
    assert.ok(mesh.triCount > 0, `${name}: expected a nonempty solid`);
    for (let index = 0; index < expectedBounds.length; index++) {
      assert.ok(Math.abs(actual.bounds[index] - expectedBounds[index]) <= tolerance,
        `${name}: bound ${index} is ${actual.bounds[index]}, expected ${expectedBounds[index]}`);
    }
  }
  console.log(`${name}: ${operation}, volume ${actual.volume}, ${mesh.triCount} triangles`);
}

async function assertRejectedCase(name, a, b, diagnostic) {
  const response = await send(3, name, a, b, "union");
  assert.equal(response.ok, false, `${name}: invalid input was accepted`);
  assert.equal(response.mesh.length, 0, `${name}: rejected input produced geometry`);
  assert.match(response.message, diagnostic, `${name}: missing actionable diagnostic`);
  console.log(`${name}: ${response.message}`);
}

let child;
let unread = Buffer.alloc(0);
let waiter = null;
function send(opcode, jobId, a, b, operation) {
  assert.equal(waiter, null);
  const frame = protocol.encodeNativeCgalRequest(opcode, jobId, a, b, operation);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Native worker timeout: ${jobId}`)), 30000);
    waiter = { resolve, reject, timer, jobId };
    child.stdin.write(frame);
    parse();
  });
}
function parse() {
  if (!waiter || unread.length < 28) return;
  const length = protocol.nativeCgalResponseLength(unread.subarray(0, 28));
  if (unread.length < length) return;
  const response = protocol.decodeNativeCgalResponse(unread.subarray(0, length));
  unread = unread.subarray(length);
  const current = waiter;
  waiter = null;
  clearTimeout(current.timer);
  assert.equal(response.jobId, current.jobId);
  current.resolve(response);
}
async function start() {
  child = spawn(executable, [], { stdio: "pipe", windowsHide: true });
  unread = Buffer.alloc(0);
  child.stdout.on("data", (chunk) => { unread = Buffer.concat([unread, chunk]); parse(); });
  child.on("error", (error) => { if (waiter) { clearTimeout(waiter.timer); waiter.reject(error); waiter = null; } });
}

await start();
try {
  const health = await send(1, "health");
  assert.equal(health.ok, true);
  assert.equal(health.message, "healthy");
  const version = await send(2, "version");
  assert.match(version.message, /protocol=1;capabilities=mesh\.boolean/);
  const a = cube(0, 0, 0), b = cube(0.5, 0.25, 0.125);
  for (const operation of ["union", "difference", "intersection"]) {
    const result = await send(3, operation, a, b, operation);
    assert.equal(result.ok, true, `${operation}: ${result.message}`);
    const mesh = protocol.decodeM3DMesh(result.mesh);
    assert.ok(mesh.vertexCount > 0 && mesh.triCount > 0, `${operation} returned empty mesh`);
    console.log(`${operation}: ${mesh.vertexCount} vertices, ${mesh.triCount} triangles`);
  }
  const base = cube(0, 0, 0);
  const disjoint = cube(3, 0, 0);
  await assertBooleanCase("disjoint-union", "union", base, disjoint, 16, [-1, 4, -1, 1, -1, 1]);
  await assertBooleanCase("disjoint-intersection", "intersection", base, disjoint, 0, null);
  await assertBooleanCase("disjoint-difference", "difference", base, disjoint, 8, [-1, 1, -1, 1, -1, 1]);

  const contained = cube(0, 0, 0, 0.5);
  await assertBooleanCase("contained-union", "union", base, contained, 8, [-1, 1, -1, 1, -1, 1]);
  await assertBooleanCase("contained-intersection", "intersection", base, contained, 1, [-0.5, 0.5, -0.5, 0.5, -0.5, 0.5]);
  await assertBooleanCase("contained-difference", "difference", base, contained, 7, [-1, 1, -1, 1, -1, 1]);

  const faceTouching = cube(2, 0, 0);
  await assertBooleanCase("face-touching-union", "union", base, faceTouching, 16, [-1, 3, -1, 1, -1, 1]);
  await assertBooleanCase("face-touching-intersection", "intersection", base, faceTouching, 0, null);
  await assertBooleanCase("face-touching-difference", "difference", base, faceTouching, 8, [-1, 1, -1, 1, -1, 1]);

  const reversedIndices = new Uint32Array(cubeIndices);
  for (let offset = 0; offset < reversedIndices.length; offset += 3) {
    [reversedIndices[offset + 1], reversedIndices[offset + 2]] = [reversedIndices[offset + 2], reversedIndices[offset + 1]];
  }
  await assertRejectedCase("reversed-winding-b", base, cube(0.5, 0, 0, 1, reversedIndices),
    /Operand B: Boolean inputs must have outward-oriented faces/);
  await assertRejectedCase("open-mesh-a", cube(0, 0, 0, 1, cubeIndices.subarray(0, -3)), base,
    /Operand A: Boolean inputs must be closed triangle meshes/);

  const invalid = await send(3, "invalid", Buffer.from("bad"), b, "union");
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /Invalid M3D mesh header/);
  assert.equal((await send(1, "still-alive")).ok, true);
  child.kill();
  await start();
  assert.equal((await send(1, "after-restart")).ok, true);
  console.log("Native CGAL protocol, Boolean fixtures, error recovery, and restart passed.");
} finally {
  child?.kill();
}

// Exercise the desktop supervisor independently of Electron's UI runtime.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return { app: { isPackaged: false } };
  return originalLoad.call(this, request, parent, isMain);
};
const { getNativeCgalWorker, stopNativeCgalWorker } = require(path.join(root, "dist/main/python/nativeCgalWorker.js"));
Module._load = originalLoad;
const supervisor = getNativeCgalWorker();
assert.ok(supervisor, "build must be discoverable by desktop supervisor");
assert.equal(await supervisor.health(), true);
assert.match(await supervisor.version(), /capabilities=mesh\.boolean/);
const meshA = cube(0, 0, 0), meshB = cube(0.5, 0.25, 0.125);
const aDecoded = protocol.decodeM3DMesh(meshA), bDecoded = protocol.decodeM3DMesh(meshB);
const request = (jobId) => ({
  jobId, operation: "union", positionsA: aDecoded.positions, indicesA: aDecoded.indices,
  positionsB: bDecoded.positions, indicesB: bDecoded.indices,
});
const result = await supervisor.boolean(request("supervised-boolean"));
assert.equal(result.ok, true);
assert.equal(result.boolean.kernel, "native-cgal");
const cancelled = Promise.allSettled([
  supervisor.boolean(request("cancel-active")),
  supervisor.boolean(request("cancel-queued")),
]);
stopNativeCgalWorker();
assert.ok((await cancelled).every((outcome) => outcome.status === "rejected"));
assert.equal(await getNativeCgalWorker().health(), true);
stopNativeCgalWorker();
console.log("Desktop supervision, cancellation, queue draining, and restart passed.");
