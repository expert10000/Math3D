import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

try {
  run(npm, ["run", "build:main"]);
  run(npm, ["run", "build:renderer"], { ...process.env, VITE_QEC_PROFILE: "off" });
  run(npx, ["playwright", "test", "tests/e2e/quantum-qec-profile-rollback.spec.ts", "--reporter=list"],
    { ...process.env, MATH3D_QEC_ROLLBACK: "1" });
} finally {
  // Leave the normal renderer in place for subsequent desktop work, even after a failed rollback check.
  run(npm, ["run", "build:renderer"], { ...process.env, VITE_QEC_PROFILE: "on" });
}
