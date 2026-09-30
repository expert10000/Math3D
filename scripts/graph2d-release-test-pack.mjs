import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const version = "1.6.0";
const pack = resolve(root, `docs/test-packs/${version}`);
const output = resolve(root, "output/release-test-pack");
mkdirSync(output, { recursive: true });
const requireRenderer = createRequire(resolve(root, "renderer/package.json"));
await requireRenderer("esbuild").build({ entryPoints: [resolve(root, "packages/core/src/index.ts")],
  bundle: true, platform: "node", format: "esm", outfile: resolve(output, "core.mjs") });
const core = await import(pathToFileURL(resolve(output, "core.mjs")).href);
const presetIds = ["line-comparison", "reciprocal-pole", "circle-ellipse", "polar-rose",
  "implicit-conics", "strict-disk", "piecewise-data-gaps"];
const expectedKinds = ["explicit-cartesian", "parametric", "polar", "implicit", "inequality", "piecewise", "point-series"];
const graphs = [...presetIds, "wave-beats-interactive", "regression-reference"];
const csvText = { "gaps.csv": "x,y\n-2,-1\n-1,-0.5\n0,NA\n1,0.5\n2,1\n",
  "regression.csv": "x,y\n0,1.2\n1,2.8\n2,4.8\n3,7.2\n4,9.2\n5,10.8\n6,12.8\n7,15.2\n" };
const csvRows = Object.fromEntries(Object.entries(csvText).map(([name, text]) => {
  const preview = core.previewGraph2DPointImport(text);
  if (preview.errors.length) throw new Error(`${name}: ${preview.errors.join("; ")}`);
  return [name, preview.rows];
}));

if (process.argv.includes("--write")) {
  mkdirSync(resolve(pack, "fixtures"), { recursive: true });
  for (const id of presetIds) {
    const launch = core.instantiateGraph2DPreset(core.getGraph2DPresetCatalog().get(id), `${version}:${id}`);
    writeFileSync(resolve(pack, `fixtures/${id}.graph.json`), core.serializeGraph2DDocument(launch.document) + "\n");
  }
  const interactive = core.getGraph2DInteractivePreset(core.getGraph2DPresetCatalog().get("wave-beats"));
  const wave = core.instantiateGraph2DPreset(interactive, `${version}:wave-beats-interactive`);
  writeFileSync(resolve(pack, "fixtures/wave-beats-interactive.graph.json"), core.serializeGraph2DDocument(wave.document) + "\n");
  const table = new core.Graph2DPointTableStore().publish(csvRows["regression.csv"]);
  let regression = core.createGraph2DDocument({ stableKey: [version, "regression-reference"], title: "Regression reference",
    source: { objects: [], variables: [], assumptions: [] } });
  regression = core.createGraph2DDocument({ ...core.applyGraph2DAuthoring(regression, { type: "create-point-series",
    draft: { label: "Reference data", table, mode: "points", domain: { min: 0, max: 7, includeMin: true, includeMax: true },
      style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } } }),
    stableKey: [version, "regression-reference"], title: "Regression reference" });
  writeFileSync(resolve(pack, "fixtures/regression-reference.graph.json"), core.serializeGraph2DDocument(regression) + "\n");
  for (const [name, text] of Object.entries(csvText)) writeFileSync(resolve(pack, `fixtures/${name}`), text);
  writeFileSync(resolve(pack, "fixtures/reject-future-version.graph.json"), JSON.stringify({ format: "math3d.graph2d-document", version: 999 }) + "\n");
  const collect = (dir, prefix = "") => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? collect(resolve(dir, item.name), `${prefix}${item.name}/`)
    : item.name === "manifest.json" ? [] : [`${prefix}${item.name}`]);
  const files = collect(pack).sort().map(path => {
    const file = resolve(pack, path);
    writeFileSync(file, readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
    return { path, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") };
  });
  writeFileSync(resolve(pack, "manifest.json"), JSON.stringify({ format: "math3d.release-test-pack", version, fixtureGraphs: graphs,
    scope: "Repeatable fixtures and checklist; automated validation does not attest physical-device acceptance.", files }, null, 2) + "\n");
}

const integrity = spawnSync(process.execPath, [resolve(pack, "verify.mjs")], { cwd: pack, encoding: "utf8" });
if (integrity.status !== 0) throw new Error(integrity.stderr || integrity.stdout);
const kinds = new Set(), documents = new Map();
for (const id of graphs) {
  const raw = readFileSync(resolve(pack, `fixtures/${id}.graph.json`), "utf8");
  const document = core.parseGraph2DDocument(raw);
  const roundTrip = core.parseGraph2DDocument(core.serializeGraph2DDocument(document));
  if (JSON.stringify(document) !== JSON.stringify(roundTrip)) throw new Error(`${id}: document round trip differs`);
  documents.set(id, document);
  document.source.objects.forEach(object => kinds.add(object.kind));
}
for (const kind of expectedKinds) if (!kinds.has(kind)) throw new Error(`Missing Graph kind: ${kind}`);
const store = new core.Graph2DPointTableStore();
for (const name of Object.keys(csvText)) {
  const actual = core.previewGraph2DPointImport(readFileSync(resolve(pack, `fixtures/${name}`), "utf8"));
  if (actual.errors.length || JSON.stringify(actual.rows) !== JSON.stringify(csvRows[name])) throw new Error(`CSV reference differs: ${name}`);
  store.publish(actual.rows);
}
for (const [id, document] of documents) {
  const preview = core.inspectGraph2DPersonalPreset(core.serializeGraph2DDocument(document), reference => store.resolve(reference) !== null);
  if (preview.missingTables.length) throw new Error(`${id}: unresolved table sidecar`);
}
const data = documents.get("regression-reference"), object = data.source.objects[0];
const fit = core.analyzeGraph2DRegression({ document: data, objectId: object.id, rows: store.resolve(object.table), model: "linear" });
if (fit.n !== 8 || fit.curve.some(point => Math.abs(point.y - (2 * point.x + 1)) > 1e-8) || Math.abs(fit.sse - .32) > 1e-8)
  throw new Error("Regression differs from independently authored y=2*x+1, SSE=0.32 reference");
let rejected = false;
try { core.parseGraph2DDocument(readFileSync(resolve(pack, "fixtures/reject-future-version.graph.json"), "utf8")); }
catch { rejected = true; }
if (!rejected) throw new Error("Future-version fixture was accepted");
const template = JSON.parse(readFileSync(resolve(pack, "results.template.json"), "utf8"));
if (template.cases.some(item => item.status !== "pending") || template.testedAt !== null) throw new Error("Blank results template must not claim tests passed");
const report = { ok: true, version, fixtureGraphs: graphs.length, kinds: [...kinds].sort(), csvTables: 2,
  checks: ["file integrity", "canonical import and serialization", "seven-kind coverage", "CSV sidecar resolution", "known linear regression and residual sum", "future-version rejection", "unattested results template"],
  physicalAcceptance: "Not inferred; use the manual checklist and source/artifact-linked evidence." };
writeFileSync(resolve(output, "check.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
