import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const executable = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright"
);
const result = spawnSync(executable, ["test", "tests/e2e/memory-stress.spec.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MATH3D_RUN_MEMORY_STRESS_E2E: "1",
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
