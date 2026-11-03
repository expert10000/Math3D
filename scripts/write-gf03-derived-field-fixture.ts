import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serializeMath3DProject } from "../packages/core/src/index";
import { createGf03Project } from "../tests/fixtures/derived-field/gf03Project";

const path = fileURLToPath(new URL("../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url));
const expected = `${serializeMath3DProject(createGf03Project())}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8").replace(/\r\n/g, "\n") !== expected)
    throw new Error("GF-03 Project fixture differs from the generated contract.");
} else writeFileSync(path, expected);
