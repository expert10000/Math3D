import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLatestSceneFromLab } from "../src/main/quantumScene/integrationBus";

test("Math3D resolves an exact verified Theory Lab notice through authenticated discovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "qi17-client-"));
  const token = randomBytes(32).toString("hex"), hash = "a".repeat(64);
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\quantum-local-${token.slice(0, 20)}` :
    join(root, `${token.slice(0, 20)}.sock`);
  const directory = join(root, "verified.qscene");
  const received: Record<string, unknown>[] = [];
  const server = createServer(socket => {
    let buffer = "";
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");
      if (!buffer.includes("\n")) return;
      const row = JSON.parse(buffer.slice(0, buffer.indexOf("\n"))) as Record<string, unknown>;
      received.push(row);
      const response = row.type === "latest" ? { ok: true,
        notice: { type: "run-completed", runId: "run-1", resultSha256: hash } } :
        { ok: true, receipt: { directory, runId: "run-1", resultSha256: hash } };
      socket.end(JSON.stringify(response) + "\n");
    });
  });
  try {
    await new Promise<void>(resolve => server.listen(endpoint, resolve));
    await writeFile(join(root, "discovery.json"), JSON.stringify({ schema: "quantum-local-bus/v1",
      application: "Quantum Hamiltonian Lab", endpoint, token, pid: process.pid }) + "\n", { mode: 0o600 });
    assert.deepEqual(await resolveLatestSceneFromLab(root), { directory, runId: "run-1", resultSha256: hash });
    assert.deepEqual(received.map(row => row.type), ["latest", "resolve-scene"]);
    assert.ok(received.every(row => row.token === token));
    assert.equal(received[1].resultSha256, hash);
    await writeFile(join(root, "discovery.json"), "{}\n", { mode: 0o600 });
    await assert.rejects(resolveLatestSceneFromLab(root), /Invalid integration bus/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
