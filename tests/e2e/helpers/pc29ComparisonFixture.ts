import { resolve } from "node:path";

const filename = resolve("tests/fixtures/pc29ComparisonProject.ts");
const { outputFiles } = require(resolve("renderer/node_modules/esbuild")).buildSync({ entryPoints: [filename], bundle: true,
  platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve("packages/core/src/index.ts"),
    "@math3d/workbook": resolve("packages/workbook/src/index.ts"),
    "@math3d/kernel": resolve("packages/kernel/src/index.ts") } });
const Module = require("node:module").Module, compiled = new Module(filename);
compiled._compile(outputFiles[0].text, filename);
export const pc29ComparisonProject: () => { raw: string; projectId: string; workbookId: string;
  noteId: string; compositionId: string; meshId: string; resultIds: string[];
  pairIds: string[] } = compiled.exports.pc29ComparisonProject;
