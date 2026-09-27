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
function cube(dx, dy, dz) {
  const values = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  return protocol.encodeM3DMesh(new Float32Array(values.flatMap(([x, y, z]) => [x + dx, y + dy, z + dz])), cubeIndices);
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
