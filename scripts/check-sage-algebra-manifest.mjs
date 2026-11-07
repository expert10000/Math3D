#!/usr/bin/env node
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
if (args.includes("--help") || args.length < 2) {
  console.log("Usage: node scripts/check-sage-algebra-manifest.mjs MANIFEST.algebra.json PROJECT.math3d [--workbook WORKBOOK.json]");
  process.exitCode = args.includes("--help") ? 0 : 2;
} else {
  const workbookFlag = args.indexOf("--workbook");
  if (args.length !== (workbookFlag < 0 ? 2 : 4) || (workbookFlag >= 0 && workbookFlag !== 2)) {
    console.error("Expected a manifest, a Project and optionally --workbook with one JSON file.");
    process.exitCode = 2;
  } else {
    const requireFromRenderer = createRequire(resolve(root, "renderer/package.json"));
    const { build } = requireFromRenderer("esbuild");
    const temporary = mkdtempSync(join(tmpdir(), "math3d-algebra-check-"));
    try {
      const output = join(temporary, "gate.mjs");
      await build({ stdin: { contents: `
        export { parseMath3DProject } from "./packages/core/src/index.ts";
        export { inspectAlgebraReproManifest, parseAlgebraReproManifest } from "./renderer/src/workbook/algebraReproManifest.ts";
      `, resolveDir: root, sourcefile: "algebra-manifest-gate.ts", loader: "ts" },
        outfile: output, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
      const { parseMath3DProject, parseAlgebraReproManifest, inspectAlgebraReproManifest } =
        await import(pathToFileURL(output).href);
      const manifest = parseAlgebraReproManifest(JSON.parse(readFileSync(resolve(args[0]), "utf8")));
      const input = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
      const project = parseMath3DProject(JSON.stringify(input.format === "math3d.project-package" ? input.project : input));
      const books = workbookFlag < 0 ? undefined : [JSON.parse(readFileSync(resolve(args[3]), "utf8"))];
      const checked = inspectAlgebraReproManifest(manifest, project, books);
      console.log(JSON.stringify({ status: "verified", projectId: project.identity.id,
        manifestHash: manifest.contentHash, ...checked }, null, 2));
    } catch (error) {
      console.error(`Algebra manifest verification failed: ${error.message}`);
      process.exitCode = 1;
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
}
