import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), esbuild = require("../renderer/node_modules/esbuild");
const code = esbuild.buildSync({ stdin: { contents: `export {mobileCurveProjectFixture} from './tests/fixtures/unified-projects/mobileCurves';
export {parseProjectPackage} from './renderer/src/projects/projectResources';
export {MobileProjectGraphSessions} from './apps/mobile/src/models/mobileProjectGraphSessions';
export {importMobileProjectPreview} from './apps/mobile/src/models/mobileProjectPreview';
export {refreshMobileProjectCurve} from './apps/mobile/src/models/mobileProjectRefresh';
export {resolveMobileProjectWorkspace} from './apps/mobile/src/models/mobileProjectReplay';
export {createMixedWorkspaceDocument,replaceMath3DProjectWorkspace,serializeMath3DProject,updateMath3DProjectMetadata} from './packages/core/src/index';`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "cjs", write: false, alias: { "@math3d/core": resolve("packages/core/src/index.ts"), "@math3d/kernel": resolve("packages/kernel/src/index.ts") } }).outputFiles[0].text;
const Module = require("node:module").Module, compiled = new Module("prj27"); compiled._compile(code, "prj27"); const api = compiled.exports;
const [mode, input, outputPath] = process.argv.slice(2), output = resolve(mode === "generate" ? input : outputPath);
if (!["generate", "verify"].includes(mode) || !input || mode === "verify" && !outputPath) throw new Error("Use generate output-directory or verify native-export output-directory");
mkdirSync(output, { recursive: true });
const fixture = api.mobileCurveProjectFixture(), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (name, value) => writeFileSync(resolve(output, name), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
if (mode === "generate") {
  write("input.math3d.project-package.json", fixture.raw);
  write("manifest.json", { projectId: fixture.project.identity.id, graphIds: fixture.graphIds, helixId: fixture.helixId,
    refreshRelationId: fixture.refreshRelationId, documents: fixture.project.workspace.entries.length, resources: fixture.resources.sidecars().length, sha256: sha(fixture.raw) });
} else {
  const raw = readFileSync(resolve(input), "utf8"), returned = api.parseProjectPackage(raw), before = fixture.project, after = returned.project;
  assert.equal(after.identity.id, before.identity.id);
  const graphId = fixture.graphIds[1], newEntries = after.workspace.entries.filter(entry => !before.workspace.entries.some(original => original.expected.id === entry.expected.id));
  assert.equal(newEntries.length, 1); assert.equal(newEntries[0].module, "curve"); const curveId = newEntries[0].expected.id;
  assert.deepEqual(after.workspace.entries.filter(entry => entry.expected.id !== graphId && entry.expected.id !== curveId), before.workspace.entries.filter(entry => entry.expected.id !== graphId));
  assert.deepEqual(after.workspace.results, before.workspace.results); assert.deepEqual(after.workspace.constructions, before.workspace.constructions); assert.deepEqual(after.workspace.artifacts, before.workspace.artifacts);
  assert.deepEqual(after.workspace.relations.slice(0, -1), before.workspace.relations); assert.equal(after.workspace.relations.length, before.workspace.relations.length + 1);
  assert.deepEqual(returned.resources.sidecars(), fixture.resources.sidecars());
  const stored = api.importMobileProjectPreview(raw, [], "native-return.json"), sessions = new api.MobileProjectGraphSessions(stored);
  const graph = sessions.adapter(graphId), curve = sessions.curve(curveId);
  assert.equal(graph.document().source.objects[0].expression.source, "x*x+4");
  assert.equal(curve.document().source.definition.expressions.y, "x*x+5");
  const originalTarget = after.workspace.relations.find(relation => relation.relationId === fixture.refreshRelationId).target.generation.documentId;
  const { [curveId]: addedMetadata, ...originalMetadata } = after.metadata.documents;
  const withoutMetadata = api.updateMath3DProjectMetadata(after, { ...after.metadata, documents: originalMetadata });
  const withoutCopy = api.replaceMath3DProjectWorkspace(withoutMetadata, api.createMixedWorkspaceDocument({ ...after.workspace,
    entries: after.workspace.entries.filter(entry => entry.expected.id !== curveId), relations: after.workspace.relations.slice(0, -1) }));
  const predicted = api.refreshMobileProjectCurve({ ...stored, serializedProject: api.serializeMath3DProject(withoutCopy) }, fixture.refreshRelationId);
  const predictedProject = JSON.parse(predicted.serializedProject);
  assert.equal(predictedProject.workspace.entries.at(-1).expected.id, curveId);
  assert.deepEqual({ ...after.metadata, documents: originalMetadata }, before.metadata); assert.equal(addedMetadata.title, `${before.metadata.documents[originalTarget].title} refreshed`);
  assert.deepEqual(after.workspace.relations.at(-1), predictedProject.workspace.relations.at(-1));
  assert.ok(graph.history().undoDepth); assert.ok(curve.history().undoDepth);
  const graphSource = graph.document().source; assert.equal(curve.undo().source.definition.expressions.y, "x*x+4"); assert.deepEqual(graph.document().source, graphSource);
  curve.redo(); const curveSource = curve.document().source; graph.undo(); assert.equal(graph.document().source.objects[0].expression.source, "x^2"); assert.deepEqual(curve.document().source, curveSource);
  write("returned-verification.json", { ok: true, sha256: sha(raw), bytes: Buffer.byteLength(raw), projectId: after.identity.id, graphId, curveId,
    documents: after.workspace.entries.length, resources: returned.resources.sidecars().length, originalDocumentsMetadataResultsAndResourceBytesUnchanged: true,
    exactRefreshLineage: true, graphExpression: "x*x+4", curveExpression: "x*x+5", independentGraphCurveUndo: true });
}
console.log(`PRJ27 ${mode} passed: ${output}`);
