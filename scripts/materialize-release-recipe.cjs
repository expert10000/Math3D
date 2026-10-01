// A dispatched release keeps the app tag fixed while applying reviewed build fixes.
// Every file below is included in the corresponding-source release-build.patch.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const recipeFiles = [
  ".github/workflows/release.yml",
  "scripts/materialize-release-recipe.cjs",
  "scripts/setup-cgal-python-worker.ps1",
  "scripts/prepare-public-source-bundle.mjs",
  "compliance/public-source-manifest.json",
];
const sha = process.env.GITHUB_WORKFLOW_SHA;
if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("Missing exact workflow commit SHA.");
for (const file of recipeFiles) {
  const content = execFileSync("git", ["show", `${sha}:${file}`]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
// Include new recipe files in git diff without changing the app commit.
execFileSync("git", ["add", "--intent-to-add", "--", ...recipeFiles]);
console.log(`Applied release build recipe ${sha}; app source remains ${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()}`);
