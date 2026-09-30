#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const target = option("--target", process.platform === "win32" ? "windows" : "linux");
const outDir = path.resolve(root, option("--out", "release-source"));
const allowedTargets = new Set(["windows", "linux", "native-cgal"]);
if (!allowedTargets.has(target)) throw new Error(`Unsupported source target: ${target}`);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, "compliance/public-source-manifest.json"), "utf8"));
const version = option("--version", packageJson.version);
fs.mkdirSync(outDir, { recursive: true });

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};

const sha256File = (filename) => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filename);
  stream.on("error", reject);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("end", () => resolve(hash.digest("hex")));
});

async function download(source) {
  const destination = path.join(outDir, source.filename);
  if (fs.existsSync(destination) && await sha256File(destination) === source.sha256) return destination;
  const temporary = `${destination}.part`;
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  const response = await fetch(source.url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Cannot download ${source.url}: HTTP ${response.status}`);
  const output = fs.createWriteStream(temporary, { flags: "wx" });
  await new Promise((resolve, reject) => {
    const reader = response.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!output.write(Buffer.from(value))) await new Promise((resume) => output.once("drain", resume));
        }
        output.end(resolve);
      } catch (error) {
        output.destroy();
        reject(error);
      }
    };
    output.on("error", reject);
    void pump();
  });
  const actual = await sha256File(temporary);
  if (actual !== source.sha256) {
    fs.unlinkSync(temporary);
    throw new Error(`${source.filename} SHA-256 mismatch: expected ${source.sha256}, received ${actual}`);
  }
  fs.renameSync(temporary, destination);
  return destination;
}

const commit = run("git", ["rev-parse", "HEAD"]);
const sourceZip = path.join(outDir, `Math3D-${version}-source.zip`);
if (fs.existsSync(sourceZip)) fs.unlinkSync(sourceZip);
run("git", ["archive", "--format=zip", `--prefix=Math3D-${version}-source/`, `--output=${sourceZip}`, "HEAD"]);

const releasePatch = run("git", ["diff", "HEAD", "--",
  "package.json", "package-lock.json", ".github/workflows/release.yml",
  "scripts/materialize-release-recipe.cjs", "scripts/setup-cgal-python-worker.ps1",
  "scripts/prepare-public-source-bundle.mjs", "compliance/public-source-manifest.json",
]);
let releasePatchName = null;
if (releasePatch) {
  releasePatchName = `Math3D-${version}-release-build.patch`;
  fs.writeFileSync(path.join(outDir, releasePatchName), `${releasePatch}\n`, "utf8");
}

const selected = sourceManifest.sources.filter((source) => source.targets.includes(target));
for (const source of selected) {
  console.log(`Fetching corresponding source: ${source.name} ${source.version}`);
  await download(source);
}

const python = process.env.MATH3D_PYTHON || (process.platform === "win32" ? "python" : "python3");
const inventoryScript = [
  "import importlib.metadata as m, json",
  "names=['numpy','scipy','sympy','CGAL','pygalmesh','vtk','meshio']",
  "print(json.dumps({n:m.version(n) for n in names if any(d.metadata['Name'].lower()==n.lower() for d in m.distributions())}, sort_keys=True))",
].join("; ");
let pythonPackages = {};
try {
  pythonPackages = JSON.parse(run(python, ["-c", inventoryScript]));
} catch (error) {
  throw new Error(`Cannot inventory the Python environment used for the release: ${error.message}`);
}
for (const [name, expected] of Object.entries(sourceManifest.pythonWorkerVersions)) {
  if (pythonPackages[name] !== expected) {
    throw new Error(`Frozen worker ${name} version mismatch: expected ${expected}, found ${pythonPackages[name] ?? "missing"}`);
  }
}

for (const filename of ["LICENSE", "THIRD_PARTY_NOTICES.md", "SOURCE_OFFER.md"]) {
  fs.copyFileSync(path.join(root, filename), path.join(outDir, filename));
}
fs.copyFileSync(path.join(root, "LICENSES/Apache-2.0.txt"), path.join(outDir, "Apache-2.0.txt"));

const materialized = {
  schemaVersion: 1,
  distributionLicense: sourceManifest.distributionLicense,
  math3d: { version, commit, buildRecipeCommit: process.env.GITHUB_WORKFLOW_SHA || commit,
    sourceArchive: path.basename(sourceZip), releaseBuildPatch: releasePatchName },
  target,
  pythonPackages,
  sources: selected,
};
fs.writeFileSync(
  path.join(outDir, `SOURCE_MANIFEST-${target}.json`),
  `${JSON.stringify(materialized, null, 2)}\n`,
  "utf8",
);
console.log(`Prepared public corresponding-source assets in ${outDir}`);
