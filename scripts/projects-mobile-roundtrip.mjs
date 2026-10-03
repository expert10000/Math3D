import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const source = `export { mobileMixedProjectFixture } from './tests/fixtures/unified-projects/mobileProjects';
export { parseProjectPackage } from './renderer/src/projects/projectResources';
export { importMobileProjectPreview } from './apps/mobile/src/models/mobileProjectPreview';
export { MobileProjectGraphSessions } from './apps/mobile/src/models/mobileProjectGraphSessions';
export { serializeMath3DProject } from '@math3d/core';`;
const { outputFiles } = require(resolve(root, "renderer/node_modules/esbuild")).buildSync({
  stdin: { contents: source, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve(root, "packages/core/src/index.ts"), "@math3d/kernel": resolve(root, "packages/kernel/src/index.ts") }
});
const compiled = new (require("node:module").Module)(import.meta.url);
compiled._compile(outputFiles[0].text, resolve(root, "scripts/projects-mobile-roundtrip.generated.cjs"));
const api = compiled.exports, fixture = api.mobileMixedProjectFixture();
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const [mode, input, outputArg] = process.argv.slice(2);
if (!input || !["generate", "verify"].includes(mode)) throw new Error("Provide: generate output-directory | verify returned-package output-directory");
const output = resolve(mode === "generate" ? input : outputArg ?? dirname(input));
mkdirSync(output, { recursive: true });
const write = (name, value) => writeFileSync(resolve(output, name), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
if (mode === "generate") {
  write("input.math3d.project-package.json", fixture.raw);
  write("missing.math3d.project.json", api.serializeMath3DProject(fixture.project));
  const corrupt = JSON.parse(fixture.raw);
  corrupt.resources[0].checksum = "sha256:" + "0".repeat(64);
  write("corrupt.math3d.project-package.json", corrupt);
  write("manifest.json", { projectId: fixture.project.identity.id, graphIds: fixture.graphIds,
    documents: fixture.project.workspace.entries.length, modules: [...new Set(fixture.project.workspace.entries.map(entry => entry.module))],
    resources: fixture.resources.sidecars().map(({ kind, id, checksum, byteLength }) => ({ kind, id, checksum, byteLength })), sha256: sha(fixture.raw) });
} else {
  const raw = readFileSync(resolve(input), "utf8"), returned = api.parseProjectPackage(raw), before = fixture.project;
  assert.equal(returned.project.identity.id, before.identity.id);
  assert.deepEqual(returned.project.metadata, before.metadata);
  assert.deepEqual(returned.project.workspace.entries.filter(entry => entry.module !== "graph2d"), before.workspace.entries.filter(entry => entry.module !== "graph2d"));
  for (const key of ["constructions", "relations", "results", "artifacts"]) assert.deepEqual(returned.project.workspace[key], before.workspace[key]);
  assert.deepEqual(returned.resources.sidecars(), fixture.resources.sidecars());
  const restored = new api.MobileProjectGraphSessions(api.importMobileProjectPreview(raw, [], "returned.json"));
  const original = new api.MobileProjectGraphSessions(api.importMobileProjectPreview(fixture.raw, [], "original.json"));
  const [a, b] = fixture.graphIds, graphA = restored.adapter(a), graphB = restored.adapter(b);
  assert.deepEqual(graphA.document().source, original.adapter(a).document().source);
  assert.notDeepEqual(graphA.document().display.viewport, original.adapter(a).document().display.viewport);
  assert.ok(graphB.document().source.objects.some(object => object.kind === "explicit-cartesian" && object.expression.source === "x*x+2"));
  assert.ok(graphA.history().undoDepth > 0); assert.ok(graphB.history().undoDepth > 0);
  const currentB = graphB.document().source;
  graphA.undo(); assert.deepEqual(graphB.document().source, currentB); graphA.redo();
  let restoredOriginal = false;
  while (graphB.history().undoDepth > 0) {
    graphB.undo();
    if (JSON.stringify(graphB.document().source) === JSON.stringify(original.adapter(b).document().source)) { restoredOriginal = true; break; }
  }
  assert.ok(restoredOriginal, "Graph B undo must restore its original source after native restart/export");
  write("returned-verification.json", { ok: true, sha256: sha(raw), bytes: Buffer.byteLength(raw), projectId: before.identity.id,
    documents: before.workspace.entries.length, resources: returned.resources.sidecars().length,
    allOtherModulesUnchanged: true, sourceBytesUnchanged: true, graphAPanRetained: true, graphBExpression: "x*x+2", independentUndoAfterRestart: true });
}
console.log(`PRJ24 ${mode} passed: ${output}`);
