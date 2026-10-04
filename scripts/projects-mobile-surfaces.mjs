import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), esbuild = require("../renderer/node_modules/esbuild");
const code = esbuild.buildSync({ stdin: { contents: `export {mobileSurfaceProjectFixture} from './tests/fixtures/unified-projects/mobileSurfaces';
export {parseProjectPackage} from './renderer/src/projects/projectResources';
export {MobileProjectGraphSessions} from './apps/mobile/src/models/mobileProjectGraphSessions';
export {importMobileProjectPreview} from './apps/mobile/src/models/mobileProjectPreview';
export {refreshMobileProjectDependency} from './apps/mobile/src/models/mobileProjectRefresh';
export {commitMobileSurfaceSource} from './apps/mobile/src/models/mobileProjectSurface';
export {commitMobileCurveSource} from './apps/mobile/src/models/mobileProjectCurve';
export {serializeMobileProjectHandoff} from './apps/mobile/src/models/mobileProjectTransfer';
export {applyGraph2DAuthoring} from './packages/core/src/index';
export {mobileGraphAuthoringAction,mobileGraphFunctionDraft} from './apps/mobile/src/models/mobileGraphAuthoring';
export {resolveMobileProjectWorkspace} from './apps/mobile/src/models/mobileProjectReplay';
export {createMixedWorkspaceDocument,replaceMath3DProjectWorkspace,serializeMath3DProject,updateMath3DProjectMetadata} from './packages/core/src/index';`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "cjs", write: false, alias: { "@math3d/core": resolve("packages/core/src/index.ts"), "@math3d/kernel": resolve("packages/kernel/src/index.ts") } }).outputFiles[0].text;
const Module = require("node:module").Module, compiled = new Module("prj30"); compiled._compile(code, "prj30"); const api = compiled.exports;
const [mode, input, outputPath] = process.argv.slice(2), output = resolve(mode !== "verify" ? input : outputPath);
if (!["generate", "verify", "simulate"].includes(mode) || !input || mode === "verify" && !outputPath) throw new Error("Use generate output-directory or verify native-export output-directory");
mkdirSync(output, { recursive: true });
const fixture = api.mobileSurfaceProjectFixture(), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (name, value) => writeFileSync(resolve(output, name), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
const manifest = { projectId: fixture.project.identity.id, graphIds: fixture.graphIds, helixId: fixture.helixId, surfaceId: fixture.surfaceId,
  graphSurfaceRelationIds: fixture.graphSurfaceRelationIds, curveSurfaceRelationIds: fixture.curveSurfaceRelationIds,
  documents: fixture.project.workspace.entries.length, resources: fixture.resources.sidecars().length, sha256: sha(fixture.raw) };
write("manifest.json", manifest);
write("input.math3d.project-package.json", fixture.raw);
if (mode === "simulate") {
  const stored = api.importMobileProjectPreview(fixture.raw, [], "input.json"), sessions = new api.MobileProjectGraphSessions(stored);
  const graph = sessions.adapter(fixture.graphIds[1]), doc = graph.document(), objectId = doc.source.objects[0].id;
  graph.commitScene(api.applyGraph2DAuthoring(doc, api.mobileGraphAuthoringAction({ objectId, draft: { ...api.mobileGraphFunctionDraft(doc, objectId), expression: "x*x+4" } })), "edit");
  graph.undo(); graph.redo();
  const curve = sessions.curve(fixture.helixId), source = curve.document().source;
  api.commitMobileCurveSource(curve, { ...source, definition: { ...source.definition, expressions: { ...source.definition.expressions, z: "t/2" } } }); curve.undo(); curve.redo();
  const surface = sessions.surface(fixture.surfaceId), s = surface.document().source;
  api.commitMobileSurfaceSource(surface, { ...s, domain: { ...s.domain, u: { ...s.domain.u, max: 2 } }, definition: { ...s.definition, expressions: { ...s.definition.expressions, z: "u*u-v*v+2" } } }); surface.undo(); surface.redo();
  let record = sessions.snapshot(fixture.surfaceId);
  for (const id of [fixture.graphSurfaceRelationIds[0], fixture.curveSurfaceRelationIds[0]]) record = api.refreshMobileProjectDependency(record, id);
  write("model-only-return.math3d.project-package.json", api.serializeMobileProjectHandoff(record));
}
if (mode === "verify") {
  const raw = readFileSync(resolve(input), "utf8"), returned = api.parseProjectPackage(raw), before = fixture.project, after = returned.project;
  assert.equal(after.identity.id, before.identity.id);
  const edited = [fixture.graphIds[1], fixture.helixId, fixture.surfaceId];
  const added = after.workspace.entries.filter(entry => !before.workspace.entries.some(original => original.expected.id === entry.expected.id));
  assert.equal(added.length, 2); assert.ok(added.every(entry => entry.module === "surface"));
  assert.deepEqual(after.workspace.entries.filter(entry => !edited.includes(entry.expected.id) && !added.includes(entry)), before.workspace.entries.filter(entry => !edited.includes(entry.expected.id)));
  for (const key of ["results", "artifacts", "constructions"]) assert.deepEqual(after.workspace[key], before.workspace[key]);
  assert.deepEqual(returned.resources.sidecars(), fixture.resources.sidecars());
  assert.deepEqual(after.workspace.relations.slice(0, -2), before.workspace.relations);
  const stored = api.importMobileProjectPreview(raw, [], "return.json"), sessions = new api.MobileProjectGraphSessions(stored);
  const graph = sessions.adapter(fixture.graphIds[1]), curve = sessions.curve(fixture.helixId), surface = sessions.surface(fixture.surfaceId);
  assert.equal(graph.document().source.objects[0].expression.source, "x*x+4");
  assert.equal(curve.document().source.definition.expressions.z, "t/2");
  assert.equal(surface.document().source.definition.expressions.z, "u*u-v*v+2");
  assert.equal(surface.document().source.domain.u.max, 2);
  const originalMetadata = Object.fromEntries(Object.entries(after.metadata.documents).filter(([id]) => !added.some(entry => entry.expected.id === id)));
  assert.deepEqual({ ...after.metadata, documents: originalMetadata }, before.metadata);
  const withoutMetadata = api.updateMath3DProjectMetadata(after, { ...after.metadata, documents: originalMetadata });
  const base = api.replaceMath3DProjectWorkspace(withoutMetadata, api.createMixedWorkspaceDocument({ ...after.workspace,
    entries: after.workspace.entries.filter(entry => !added.includes(entry)), relations: after.workspace.relations.slice(0, -2) }));
  let predicted = { ...stored, serializedProject: api.serializeMath3DProject(base) };
  for (const id of [fixture.graphSurfaceRelationIds[0], fixture.curveSurfaceRelationIds[0]]) predicted = api.refreshMobileProjectDependency(predicted, id);
  const predictedProject = JSON.parse(predicted.serializedProject);
  assert.deepEqual(added, predictedProject.workspace.entries.slice(-2));
  assert.deepEqual(after.workspace.relations.slice(-2), predictedProject.workspace.relations.slice(-2));
  const saved = [graph.document().source, curve.document().source, surface.document().source];
  assert.equal(surface.undo().source.definition.expressions.z, "u*u-v*v"); assert.equal(surface.document().source.domain.u.max, 1);
  assert.deepEqual(graph.document().source, saved[0]); assert.deepEqual(curve.document().source, saved[1]); surface.redo();
  assert.equal(curve.undo().source.definition.expressions.z, "t/4"); assert.deepEqual(surface.document().source, saved[2]); curve.redo();
  assert.equal(graph.undo().source.objects[0].expression.source, "x^2"); assert.deepEqual(curve.document().source, saved[1]); graph.redo();
  write("returned-verification.json", { ...manifest, ok: true, sha256: sha(raw), bytes: Buffer.byteLength(raw),
    documents: after.workspace.entries.length, graphId: fixture.graphIds[1], curveId: fixture.helixId,
    exactRefreshLineage: true, historicalDocumentsMetadataResultsResourcesUnchanged: true, independentGraphCurveSurfaceUndo: true,
    graphExpression: "x*x+4", curveExpression: "t/2", surfaceExpression: "u*u-v*v+2", surfaceUMax: 2 });
}
console.log(`PRJ30 ${mode} passed: ${output}`);
