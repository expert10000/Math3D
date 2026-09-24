import { describe, expect, it } from "vitest";
import { parseMobileWorkerPairing } from "../../apps/mobile/src/models/mobileWorkerPairing";

const protocol = "2026-03-15";
const token = "12345678901234567890123456789012";

const pairingUrl = (overrides: Record<string, string> = {}) => {
  const value = new URL("math3d://worker-pair");
  value.searchParams.set("endpoint", overrides.endpoint ?? "http://192.168.1.50:8787/api/worker");
  value.searchParams.set("token", overrides.token ?? token);
  value.searchParams.set("expires", overrides.expires ?? "2000000");
  value.searchParams.set("protocol", overrides.protocol ?? protocol);
  return value.toString();
};

describe("mobile worker pairing", () => {
  it("accepts a current Math3D pairing URL", () => {
    expect(parseMobileWorkerPairing(pairingUrl(), protocol, 1_000_000)).toEqual({
      ok: true,
      pairing: {
        endpoint: "http://192.168.1.50:8787/api/worker",
        token,
        expiresAt: 2_000_000,
        protocol,
      },
    });
  });

  it("rejects expired and protocol-incompatible codes", () => {
    expect(parseMobileWorkerPairing(pairingUrl({ expires: "999999" }), protocol, 1_000_000)).toMatchObject({
      ok: false,
      error: expect.stringContaining("expired"),
    });
    expect(parseMobileWorkerPairing(pairingUrl({ protocol: "legacy" }), protocol, 1_000_000)).toMatchObject({
      ok: false,
      error: expect.stringContaining("expected"),
    });
  });

  it("rejects unrelated QR codes, invalid endpoints, and short tokens", () => {
    expect(parseMobileWorkerPairing("https://example.com", protocol, 1_000_000).ok).toBe(false);
    expect(parseMobileWorkerPairing(pairingUrl({ endpoint: "file:///tmp/worker" }), protocol, 1_000_000).ok).toBe(false);
    expect(parseMobileWorkerPairing(pairingUrl({ token: "short" }), protocol, 1_000_000).ok).toBe(false);
  });
});
