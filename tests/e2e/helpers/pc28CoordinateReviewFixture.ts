import { resolve } from "node:path";

const filename = resolve("tests/fixtures/pc28CoordinateReviewProject.ts");
const { outputFiles } = require(resolve("renderer/node_modules/esbuild")).buildSync({ entryPoints: [filename], bundle: true,
  platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve("packages/core/src/index.ts"),
    "@math3d/workbook": resolve("packages/workbook/src/index.ts"),
    "@math3d/kernel": resolve("packages/kernel/src/index.ts") } });
const Module = require("node:module").Module, compiled = new Module(filename);
compiled._compile(outputFiles[0].text, filename);
export const pc28CoordinateReviewProject: () => { raw: string; projectId: string; workbookId: string;
  noteId: string; compositionId: string; coordinate: [number, number, number] } = compiled.exports.pc28CoordinateReviewProject;
