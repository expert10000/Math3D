import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateGraphDeviceEvidence, GRAPH_DEVICE_CASES, GRAPH_DEVICE_SLOTS } from "../../scripts/mobile-graph-device-gate.mjs";

// Synthetic records test gate logic only; they are never written as device signoff.
const sourceCommit = "a".repeat(40), android = "b".repeat(64), ios = "c".repeat(64), now = Date.parse("2026-09-28T15:00:00Z");
const expected = { sourceCommit, artifacts: { android, ios } };
const complete = () => ({ format: "math3d.mobile-graph-device-evidence.v1", sourceCommit,
  builds: Object.fromEntries(Object.entries(expected.artifacts).map(([platform, sha256]) => [platform,
    { sha256, configuration: "release", bundle: "embedded", applicationId: `test.${platform}`, version: "1.5.1", build: "150007", signingCertificateSha256: "d".repeat(64) }])),
  devices: GRAPH_DEVICE_SLOTS.map((slot: string) => ({ slot, kind: "physical", platform: slot.startsWith("android") ? "android" : "ios",
    model: `Synthetic ${slot}`, os: "Test OS", tester: "Synthetic tester", testedAt: "2026-09-28T14:00:00Z", sourceCommit,
    artifactSha256: slot.startsWith("android") ? android : ios,
    cases: Object.fromEntries([...GRAPH_DEVICE_CASES, "tablet-split-pane"].map((name: string) => [name, { status: "passed", evidence: "Synthetic evidence" }])),
    metrics: { runs: 10, samplingP95Ms: 12, nextFrameDeliveryP95Ms: 20, serializedArtifactPeakBytes: 20000,
      serializedPointCachePeakBytes: 100000, report: "Synthetic measurements", calibrationDecision: "Synthetic reviewed limits" } })) });

describe("MOB-G13 physical Graph companion acceptance gate", () => {
  it("accepts complete exact-build attestation and rejects the pending repository template", () => {
    expect(evaluateGraphDeviceEvidence(complete(), expected, now).ok).toBe(true);
    const template = JSON.parse(readFileSync("docs/mobile-graph-device-evidence.template.json", "utf8"));
    expect(evaluateGraphDeviceEvidence(template, expected, now).ok).toBe(false);
  });
  it("cannot promote emulator/simulator or Metro-dependent builds to physical acceptance", () => {
    const evidence = complete(); evidence.devices[0]!.kind = "emulator"; evidence.builds.ios.bundle = "metro";
    const report = evaluateGraphDeviceEvidence(evidence, expected, now);
    expect(report.ok).toBe(false); expect(report.failures.join(" ")).toContain("physical"); expect(report.failures.join(" ")).toContain("Metro/debug");
  });
  it("rejects stale source, replaced artifact, duplicate/missing devices and future test dates", () => {
    const evidence = complete(); evidence.sourceCommit = "e".repeat(40); evidence.devices[1]!.artifactSha256 = "f".repeat(64);
    evidence.devices[0]!.testedAt = "2027-01-01T00:00:00Z"; evidence.devices.push(evidence.devices[0]!); evidence.devices.splice(5, 1);
    const report = evaluateGraphDeviceEvidence(evidence, expected, now);
    expect(report.ok).toBe(false); expect(report.failures.join(" ")).toMatch(/Source commit/);
    expect(report.failures.join(" ")).toMatch(/device source\/artifact/); expect(report.failures.join(" ")).toMatch(/exactly one/);
    expect(report.failures.join(" ")).toMatch(/non-future/);
  });
  it("requires all native cases, tablet evidence, measured calibration and bounded retention", () => {
    const evidence = complete(); evidence.devices[0]!.cases["native-import-share"].status = "pending";
    evidence.devices[3]!.cases["tablet-split-pane"].evidence = "";
    evidence.devices[4]!.metrics.runs = 1; evidence.devices[5]!.metrics.serializedArtifactPeakBytes = 2 * 1024 * 1024;
    evidence.devices[5]!.metrics.samplingP95Ms = NaN;
    const report = evaluateGraphDeviceEvidence(evidence, expected, now);
    expect(report.ok).toBe(false);
    for (const phrase of ["native-import-share", "tablet-split-pane", "ten measured", "retention ceiling", "samplingP95Ms"])
      expect(report.failures.join(" ")).toContain(phrase);
  });
  it("handles malformed data fail-closed without trusting evidence as instructions", () => {
    for (const evidence of [null, {}, { devices: "passed" }, { devices: [null] }])
      expect(evaluateGraphDeviceEvidence(evidence, expected, now).ok).toBe(false);
  });
  it("requires new professional features on every physical device without waiving G13", () => {
    for (const name of ["publication-offline-print", "scales-continuation-log", "parameters-animation-cancel", "regression-residuals-intervals"]) {
      const evidence = complete(); evidence.devices[2]!.cases[name].status = "pending";
      const report = evaluateGraphDeviceEvidence(evidence, expected, now);
      expect(report.ok).toBe(false); expect(report.failures.join(" ")).toContain(name);
    }
  });
});
