import { resolve } from "node:path";
const { buildSync } = require(resolve("renderer/node_modules/esbuild"));
const filename = resolve("tests/fixtures/unified-projects/meshResources.ts");
const { outputFiles } = buildSync({ entryPoints: [filename], bundle: true, platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve("packages/core/src/index.ts"), "@math3d/kernel": resolve("packages/kernel/src/index.ts") } });
const FixtureModule = require("node:module").Module;
const compiled = new FixtureModule(filename);
compiled._compile(outputFiles[0].text, filename);
export const meshResourceFixture: () => { project: any; docs: any[]; result: any; raw: string } = compiled.exports.meshResourceFixture;
export const inspectMeshPackage: (raw: string) => { document: any; selection: string[]; positions: number[]; normals: number[]; uvs: number[]; resourceCount: number }[] = compiled.exports.inspectMeshPackage;
export const pointResourceFixture: () => { project: any; raw: string } = compiled.exports.pointResourceFixture;
