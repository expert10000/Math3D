import { describe, expect, it } from "vitest";
import {
  evaluateMobileWorkerCapabilities,
  MOBILE_IMPLICIT_PREVIEW_CAPABILITY,
  mobileWorkerHasCapability,
} from "../../apps/mobile/src/models/mobileWorkerCapabilities";

const EXPECTED_PROTOCOL = "2026-03-15";

describe("mobile worker capability negotiation", () => {
  it("accepts a compatible identified worker and exposes named capabilities", () => {
    const negotiation = evaluateMobileWorkerCapabilities({
      ok: true,
      version: "1.5.1",
      protocol: EXPECTED_PROTOCOL,
      serverVersion: "1.5.0",
      engine: { id: "math3d-python-worker", version: "1.5.1" },
      capabilities: ["cgal.health", MOBILE_IMPLICIT_PREVIEW_CAPABILITY],
    }, EXPECTED_PROTOCOL);

    expect(negotiation.status).toBe("ready");
    expect(mobileWorkerHasCapability(negotiation, MOBILE_IMPLICIT_PREVIEW_CAPABILITY)).toBe(true);
    expect(mobileWorkerHasCapability(negotiation, "volume.isosurface")).toBe(false);
  });

  it("rejects protocol mismatches before compute is exposed", () => {
    const negotiation = evaluateMobileWorkerCapabilities({
      ok: true,
      protocol: "legacy",
      serverVersion: "1.5.0",
      engine: { id: "math3d-python-worker", version: "1.5.1" },
      capabilities: [MOBILE_IMPLICIT_PREVIEW_CAPABILITY],
    }, EXPECTED_PROTOCOL);

    expect(negotiation).toMatchObject({ status: "incompatible", protocol: "legacy" });
    expect(mobileWorkerHasCapability(negotiation, MOBILE_IMPLICIT_PREVIEW_CAPABILITY)).toBe(false);
  });

  it("rejects legacy responses that do not identify capabilities or an engine", () => {
    const negotiation = evaluateMobileWorkerCapabilities({
      ok: true,
      version: "1.5.1",
      protocol: EXPECTED_PROTOCOL,
    }, EXPECTED_PROTOCOL);

    expect(negotiation.status).toBe("incompatible");
    expect(negotiation.message).toContain("server and engine identity");
  });

  it("reports failed version requests as unavailable", () => {
    expect(evaluateMobileWorkerCapabilities({ ok: false, error: "offline" }, EXPECTED_PROTOCOL)).toMatchObject({
      status: "unavailable",
      message: "offline",
    });
  });
});
