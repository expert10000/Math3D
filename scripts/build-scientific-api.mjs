import { createRequire } from "node:module";

const requireRenderer = createRequire(new URL("../renderer/package.json", import.meta.url));
const { build } = requireRenderer("esbuild");

await build({
  entryPoints: ["services/scientific-api/main.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "output/scientific-api/server.mjs",
  packages: "bundle",
  logLevel: "info",
});
