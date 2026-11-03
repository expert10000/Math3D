import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serializeMath3DProject } from "../packages/core/src/math3dProject";
import { createGf01LegacyProject } from "../tests/fixtures/scientific-selection/gf01LegacyProject";

const path = resolve("tests/fixtures/scientific-selection/gf01-legacy-project.math3d");
const content = `${serializeMath3DProject(createGf01LegacyProject())}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8").replace(/\r\n/g, "\n") !== content)
    throw new Error("GF-01 Project fixture is out of date.");
} else {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
