import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url));
const filename = resolve(root, "tests/fixtures/unified-projects/projectFreeze.ts");
const { outputFiles } = require(resolve(root, "renderer/node_modules/esbuild")).buildSync({
  entryPoints: [filename], bundle: true, platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve(root, "packages/core/src/index.ts"), "@math3d/kernel": resolve(root, "packages/kernel/src/index.ts") },
});
const Module = require("node:module").Module, fixtureModule = new Module(filename);
fixtureModule._compile(outputFiles[0].text, filename);
const fixture = fixtureModule.exports.projectFreezeFixture(), directory = resolve(root, "output/projects-integration/preset-test-pack");
mkdirSync(directory, { recursive: true });
const files = {
  "all-modules.resources.json": fixture.raw,
  "catenary-study.math3d.project.json": JSON.stringify(fixture.mobile),
  "invalid.math3d.project.json": "{invalid-json",
};
const manifest = {
  format: "math3d.projects-preset-test-pack.v1",
  sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
  generatedAt: new Date().toISOString(),
  fixtureBundleSha256: createHash("sha256").update(outputFiles[0].text).digest("hex"),
  desktop: { projectId: fixture.project.identity.id, documents: fixture.project.workspace.entries.length,
    modules: [...new Set(fixture.project.workspace.entries.map((entry) => entry.module))].sort(),
    relations: fixture.project.workspace.relations.length },
  mobile: { projectId: fixture.mobile.identity.id, scope: "one Graph; checkpointed Curve and Surface companions" },
  files: Object.entries(files).map(([name, raw]) => ({ name, byteLength: Buffer.byteLength(raw), sha256: createHash("sha256").update(raw).digest("hex") })),
};
for (const [name, raw] of Object.entries(files)) writeFileSync(resolve(directory, name), raw);
writeFileSync(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Preset acceptance pack: ${directory} (${manifest.desktop.documents} documents, ${manifest.desktop.relations} relations).`);
