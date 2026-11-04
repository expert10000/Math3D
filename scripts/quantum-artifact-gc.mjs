import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SharedArtifactStore } = require("../dist/main/quantumScene/artifactStore.js");
const [action = "--dry-run", hash] = process.argv.slice(2);
const store = new SharedArtifactStore();

if (action === "--dry-run" && hash === undefined) {
  console.log(JSON.stringify(await store.collect(true), null, 2));
} else if (action === "--quarantine" && hash === undefined) {
  console.log(JSON.stringify(await store.collect(false), null, 2));
} else if (action === "--restore" && /^[a-f0-9]{64}$/.test(hash ?? "")) {
  await store.restore(hash);
  console.log(JSON.stringify({ restored: hash }, null, 2));
} else {
  throw new Error("Usage: node scripts/quantum-artifact-gc.mjs [--dry-run | --quarantine | --restore <sha256>]");
}
