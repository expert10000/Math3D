import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const proxyScript = resolve(repositoryRoot, "apps/web/server/worker-proxy.cjs");
const protocol = process.env.MATH3D_MOBILE_PAIR_PROTOCOL || "2026-03-15";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const isPrivateIpv4 = (address) =>
  /^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);

const detectLanAddress = () => {
  const candidates = Object.values(networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
  return candidates.find(isPrivateIpv4) || candidates[0] || null;
};

const address = argumentValue("--address") || detectLanAddress();
const port = Number(argumentValue("--port") || process.env.MATH3D_WEB_WORKER_PROXY_PORT || 8787);
const ttlMinutes = Math.max(1, Number(argumentValue("--ttl") || 10));

if (!address) throw new Error("No LAN IPv4 address found. Pass --address <phone-reachable-ip>.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Pairing port must be between 1 and 65535.");

const token = randomBytes(24).toString("base64url");
const expiresAt = Date.now() + ttlMinutes * 60_000;
const endpoint = `http://${address}:${port}/api/worker`;
const pairingUrl = new URL("math3d://worker-pair");
pairingUrl.searchParams.set("endpoint", endpoint);
pairingUrl.searchParams.set("token", token);
pairingUrl.searchParams.set("expires", String(expiresAt));
pairingUrl.searchParams.set("protocol", protocol);

console.log("Math3D mobile worker pairing");
console.log(`Endpoint: ${endpoint}`);
console.log(`Expires: ${new Date(expiresAt).toISOString()} (${ttlMinutes} minutes)`);
console.log("On the phone, open Settings > Pair with desktop and scan this code:");
qrcode.generate(pairingUrl.toString(), { small: true });
console.log(pairingUrl.toString());
console.log("Keep this window open while the phone uses remote compute. Press Ctrl+C to stop.");

const child = spawn(process.execPath, [proxyScript], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    MATH3D_WEB_WORKER_PROXY_HOST: "0.0.0.0",
    MATH3D_WEB_WORKER_PROXY_PORT: String(port),
    MATH3D_MOBILE_PAIR_TOKEN: token,
    MATH3D_MOBILE_PAIR_EXPIRES_AT: String(expiresAt),
  },
  stdio: "inherit",
  windowsHide: true,
});

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
