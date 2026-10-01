import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const manifest = read("tests/fixtures/post-1.6.0/roadmap-evidence.json");
const expectedIds = [["F", 8], ["T", 13], ["C", 12], ["GK", 20]]
  .flatMap(([prefix, count]) => Array.from({ length: count }, (_, i) => prefix + String(i + 1).padStart(2, "0")));
const ids = manifest.entries.map((entry) => entry.id);
if (manifest.schemaVersion !== 1 || JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
  throw new Error("Expected one evidence row for each F01-F08, T01-T13, C01-C12 and GK01-GK20 milestone.");
}
for (const entry of manifest.entries) {
  for (const key of ["implementation", "test", "doc"]) {
    const target = path.resolve(root, entry[key]);
    if (!target.startsWith(root) || !fs.existsSync(target)) throw new Error(`${entry.id}: missing or external ${key}: ${entry[key]}`);
  }
}
console.log(`Verified ${ids.length} milestone evidence rows. File presence does not establish release acceptance.`);

if (process.argv.includes("--run")) {
  const testFiles = [...new Set(manifest.entries.map((entry) => entry.test.replace(/^renderer\//, "")))];
  testFiles.push("src/topology/post160Regression.test.ts", "src/math/complexPost160Regression.test.ts", "src/math/complexPlatformBaseline.test.ts");
  testFiles.push("src/topology/post160Upgrade.test.ts", "src/graph2d/post160Upgrade.test.ts");
  testFiles.push("src/core/math3dProject.test.ts", "src/core/projectExplorer.test.ts", "src/projects/projectLibrary.test.ts");
  testFiles.push("src/projects/projectOperations.test.ts");
  const report = path.join(root, "post160-test-results.json");
  const result = spawnSync(process.execPath, [path.join(root, "renderer/node_modules/vitest/vitest.mjs"), "run", ...testFiles,
    "--reporter=json", `--outputFile=${report}`], { cwd: path.join(root, "renderer"), stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const tests = read("post160-test-results.json");
  if (!tests.success || tests.numFailedTests || tests.numPendingTests) throw new Error("Audit gate did not fully pass.");
  for (const name of testFiles) {
    const suite = tests.testResults.find((suite) => suite.name.replaceAll("\\", "/").endsWith(`/renderer/${name}`));
    if (!suite || suite.status !== "passed" || !suite.assertionResults.length || suite.assertionResults.some((test) => test.status !== "passed")) {
      throw new Error(`No fully passing evidence for ${name}`);
    }
  }
  console.log(`${testFiles.length} files, ${tests.numPassedTests} passing tests; all mapped tests executed. Full acceptance, installed Sage and device evidence remain separate gates.`);
}
