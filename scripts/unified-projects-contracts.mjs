import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = (label, args, cwd = root) => {
  console.log(label);
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const vitest = path.join(root, "renderer/node_modules/vitest/vitest.mjs");
run("Named project contracts, templates and mobile envelope transfer", [vitest, "run", "src/projects", "src/core/math3dProject.test.ts", "src/core/projectExplorer.test.ts"], path.join(root, "renderer"));
run("Existing native storage, Graph and transfer model regressions", [vitest, "run", "--config", path.join(root, "renderer/vite.config.ts"),
  ...["mobileGraphProject", "mobileGraphPromotions", "mobileGraphRoundTrip", "mobileProjectOperations", "mobileProjectTransfer", "mobileGraphPersonalProjects",
    "mobileSceneStorage", "mobileProjectTransferService", "mobileProjectPreview", "mobileProjectResources", "mobileProjectGraphSessions", "mobileProjectCurveSessions", "mobileProjectRefresh", "mobileProjectExplorer", "mobileProjectLibrary", "mobileStartupProject"].map((name) => `tests/unit/${name}.test.ts`)]);
run("Portable mobile fixture TypeScript", [path.join(root, "renderer/node_modules/typescript/bin/tsc"), "-p", "tests/projects/tsconfig.json", "--noEmit"]);
console.log("Project host-model contracts passed. Native device, installed-engine and complete editor-restoration acceptance are separate gates.");
