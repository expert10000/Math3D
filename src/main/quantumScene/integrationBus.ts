import { connect } from "node:net";
import { homedir } from "node:os";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const SCHEMA = "quantum-local-bus/v1";
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/;

export function integrationBusRoot(): string {
  const override = process.env.QUANTUM_INTEGRATION_BUS_HOME;
  if (override && (!isAbsolute(override) || resolve(override) !== override)) throw new Error("Invalid integration bus root");
  return override ?? join(homedir(), ".quantum-integration-bus");
}

type Discovery = { schema: string; application: string; endpoint: string; token: string; pid: number };
async function discovery(root: string): Promise<Discovery> {
  const file = join(root, "discovery.json");
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096 ||
      process.platform !== "win32" && (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0))
    throw new Error("Untrusted integration bus discovery file");
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid integration bus discovery");
  const row = value as Record<string, unknown>;
  const endpoint = row.endpoint;
  if (Object.keys(row).sort().join() !== "application,endpoint,pid,schema,token" || row.schema !== SCHEMA ||
      row.application !== "Quantum Hamiltonian Lab" || typeof row.token !== "string" || !HASH.test(row.token) ||
      !Number.isSafeInteger(row.pid) || typeof endpoint !== "string" ||
      !(process.platform === "win32" ? /^\\\\\.\\pipe\\quantum-local-[a-f0-9]{20}$/.test(endpoint) :
        endpoint.startsWith(resolve(root) + "/") && endpoint.endsWith(".sock")))
    throw new Error("Invalid integration bus endpoint or identity");
  return row as Discovery;
}

export async function requestLocalIntegrationBus(type: "hello" | "latest" | "resolve-scene",
  values: Record<string, string> = {}, root = integrationBusRoot()): Promise<Record<string, unknown>> {
  const target = await discovery(root);
  const request = JSON.stringify({ type, token: target.token, ...values }) + "\n";
  if (Buffer.byteLength(request) > 4096) throw new Error("Integration bus request exceeds limit");
  return new Promise((ok, fail) => {
    const socket = connect(target.endpoint);
    let data = "", settled = false;
    const reject = (error: Error) => { if (!settled) { settled = true; socket.destroy(); fail(error); } };
    socket.setTimeout(10_000, () => reject(new Error("Integration bus timed out")));
    socket.once("error", reject);
    socket.once("connect", () => socket.write(request));
    socket.on("data", chunk => {
      if (settled) return;
      data += chunk.toString("utf8");
      if (Buffer.byteLength(data) > 4096) { reject(new Error("Integration bus response exceeds limit")); return; }
      const newline = data.indexOf("\n");
      if (newline < 0) return;
      try {
        const response: unknown = JSON.parse(data.slice(0, newline));
        if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("Invalid integration bus response");
        const row = response as Record<string, unknown>;
        if (row.ok !== true) throw new Error(typeof row.error === "string" ? row.error : "Integration bus refused request");
        settled = true; socket.end(); ok(row);
      } catch (error) { reject(error as Error); }
    });
  });
}

export async function resolveLatestSceneFromLab(root = integrationBusRoot()) {
  const latest = await requestLocalIntegrationBus("latest", {}, root);
  const notice = latest.notice;
  if (!notice || typeof notice !== "object" || Array.isArray(notice)) throw new Error("No completed Theory Lab run is available");
  const row = notice as Record<string, unknown>;
  if (row.type !== "run-completed" || typeof row.runId !== "string" || !ID.test(row.runId) ||
      typeof row.resultSha256 !== "string" || !HASH.test(row.resultSha256)) throw new Error("Invalid completed run notice");
  const resolved = await requestLocalIntegrationBus("resolve-scene", { runId: row.runId,
    resultSha256: row.resultSha256, view: "standard" }, root);
  const receipt = resolved.receipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("Invalid resolved scene receipt");
  const scene = receipt as Record<string, unknown>;
  if (scene.runId !== row.runId || scene.resultSha256 !== row.resultSha256 ||
      typeof scene.directory !== "string" || !isAbsolute(scene.directory) ||
      resolve(scene.directory) !== scene.directory || !scene.directory.endsWith(".qscene"))
    throw new Error("Resolved scene differs from the completed run");
  return { directory: scene.directory, runId: row.runId, resultSha256: row.resultSha256 };
}
