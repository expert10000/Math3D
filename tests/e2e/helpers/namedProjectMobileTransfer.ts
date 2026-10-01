import { resolve } from "node:path";

// Shared node_modules can be junctions into another checkout. Compile this trusted
// test fixture with explicit workspace aliases, as the renderer and mobile compiler do.
const { buildSync } = require(resolve("renderer/node_modules/esbuild"));
const filename = resolve("tests/fixtures/unified-projects/mobileRoundTrip.ts");
const { outputFiles } = buildSync({ entryPoints: [filename], bundle: true, platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve("packages/core/src/index.ts"), "@math3d/kernel": resolve("packages/kernel/src/index.ts") } });
const FixtureModule = require("node:module").Module;
const compiled = new FixtureModule(filename);
compiled._compile(outputFiles[0].text, filename);
export const transferNamedProjectThroughMobile: (raw: string, edit: boolean) => string = compiled.exports.roundTripNamedProjectOnMobile;
