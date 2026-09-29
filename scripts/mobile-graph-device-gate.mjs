import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GRAPH_DEVICE_SLOTS = ["android-low", "android-mid", "android-high", "android-tablet", "ios-phone", "ios-tablet"];
export const GRAPH_DEVICE_CASES = ["create-open-edit", "pan-pinch-cancel-undo", "probe-overlap", "multi-function-analysis",
  "save-reopen", "background-resume", "portrait-landscape", "desktop-fixture-compatibility", "native-import-share",
  "keyboard-accessibility", "workload-recovery", "crash-log-review",
  "publication-offline-print", "scales-continuation-log", "parameters-animation-cancel", "regression-residuals-intervals", "grid-display-controls"];
const sha = (value, length) => typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

/** Checks attested evidence completeness/provenance, not whether a human actually performed a test. */
export const evaluateGraphDeviceEvidence = (evidence, expected, now = Date.now()) => {
  const failures = [], require = (condition, message) => { if (!condition) failures.push(message); };
  require(evidence?.format === "math3d.mobile-graph-device-evidence.v1", "Unknown evidence format.");
  require(sha(evidence?.sourceCommit, 40) && evidence.sourceCommit === expected?.sourceCommit, "Source commit does not match the reviewed source.");
  for (const platform of ["android", "ios"]) {
    const build = evidence?.builds?.[platform];
    require(sha(build?.sha256, 64) && build.sha256 === expected?.artifacts?.[platform], `${platform}: missing or mismatched actual artifact SHA-256.`);
    require(build?.configuration === "release" && build?.bundle === "embedded", `${platform}: standalone embedded release build required (Metro/debug is not acceptance).`);
    require(nonempty(build?.applicationId) && nonempty(build?.version) && nonempty(build?.build), `${platform}: application/version/build identity missing.`);
    require(sha(build?.signingCertificateSha256, 64), `${platform}: signing certificate identity missing.`);
  }
  require(Array.isArray(evidence?.devices), "Device evidence must be an array.");
  const devices = Array.isArray(evidence?.devices) ? evidence.devices : [];
  for (const slot of GRAPH_DEVICE_SLOTS) {
    const matches = devices.filter((device) => device?.slot === slot), device = matches[0];
    require(matches.length === 1, `${slot}: exactly one device record required.`);
    const platform = slot.startsWith("android") ? "android" : "ios";
    require(device?.kind === "physical" && device?.platform === platform, `${slot}: physical ${platform} device required; emulator evidence cannot sign off.`);
    require(nonempty(device?.model) && nonempty(device?.os) && nonempty(device?.tester), `${slot}: device/OS/tester missing.`);
    const testedAt = Date.parse(device?.testedAt);
    require(Number.isFinite(testedAt) && testedAt <= now && testedAt >= Date.parse("2026-01-01"), `${slot}: valid non-future test date required.`);
    require(device?.sourceCommit === evidence?.sourceCommit && sha(device?.artifactSha256, 64) && device.artifactSha256 === evidence?.builds?.[platform]?.sha256, `${slot}: device source/artifact differs from reviewed build.`);
    const cases = slot.endsWith("tablet") ? [...GRAPH_DEVICE_CASES, "tablet-split-pane"] : GRAPH_DEVICE_CASES;
    for (const name of cases) require(device?.cases?.[name]?.status === "passed" && nonempty(device.cases[name].evidence), `${slot}: ${name} is pending/failed or lacks evidence.`);
    const metrics = device?.metrics;
    require(metrics?.runs >= 10 && Number.isSafeInteger(metrics.runs), `${slot}: at least ten measured workload runs required.`);
    for (const key of ["samplingP95Ms", "nextFrameDeliveryP95Ms", "serializedArtifactPeakBytes", "serializedPointCachePeakBytes"])
      require(typeof metrics?.[key] === "number" && Number.isFinite(metrics[key]) && metrics[key] >= 0, `${slot}: invalid ${key}.`);
    require(metrics?.serializedArtifactPeakBytes <= 1024 * 1024 && metrics?.serializedPointCachePeakBytes <= 4 * 1024 * 1024, `${slot}: serialized retention ceiling exceeded.`);
    require(nonempty(metrics?.report) && nonempty(metrics?.calibrationDecision), `${slot}: measurement report and reviewed profile calibration decision required.`);
  }
  return { ok: failures.length === 0, sourceCommit: evidence?.sourceCommit ?? null, failures };
};

const root = fileURLToPath(new URL("..", import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), evidencePath = args.shift(), artifacts = {};
    if (!evidencePath) throw new Error("Usage: node scripts/mobile-graph-device-gate.mjs evidence.json --android exact.apk --ios exact.ipa");
    while (args.length) {
      const flag = args.shift(), path = args.shift();
      if (!["--android", "--ios"].includes(flag) || !path || artifacts[flag.slice(2)]) throw new Error("Provide each --android/--ios exact artifact once.");
      artifacts[flag.slice(2)] = createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
    }
    const git = (...values) => {
      const result = spawnSync("git", values, { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr.trim() || "Cannot verify Git source.");
      return result.stdout.trim();
    };
    const evidence = JSON.parse(readFileSync(resolve(evidencePath), "utf8"));
    const sourcePaths = ["apps/mobile", "packages/core", "packages/kernel", "packages/api-client", "package.json", "package-lock.json"];
    if (!sha(evidence?.sourceCommit, 40)) throw new Error("Evidence sourceCommit is pending/invalid.");
    git("merge-base", "--is-ancestor", evidence.sourceCommit, "HEAD");
    const reviewedTree = git("ls-tree", "-r", evidence.sourceCommit, "--", ...sourcePaths);
    if (reviewedTree !== git("ls-tree", "-r", "HEAD", "--", ...sourcePaths)) throw new Error("Runtime source changed since tested commit.");
    if (git("status", "--porcelain", "--", ...sourcePaths)) throw new Error("Runtime source has local changes; build/test committed source first.");
    const report = evaluateGraphDeviceEvidence(evidence, { sourceCommit: evidence.sourceCommit, artifacts });
    console.log(JSON.stringify(report, null, 2)); process.exitCode = report.ok ? 0 : 1;
  } catch (caught) { console.error(`Graph device gate blocked: ${caught.message}`); process.exitCode = 1; }
}
