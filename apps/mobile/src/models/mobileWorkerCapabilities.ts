import type { CgalVersionResponse, WorkerCapabilityId, WorkerEngineIdentity } from "@math3d/core";

export const MOBILE_IMPLICIT_PREVIEW_CAPABILITY: WorkerCapabilityId = "vtk.preview-implicit";

export type MobileWorkerNegotiationStatus =
  | "unconfigured"
  | "negotiating"
  | "ready"
  | "incompatible"
  | "unavailable";

export type MobileWorkerNegotiation = {
  status: MobileWorkerNegotiationStatus;
  message: string;
  protocol: string | null;
  serverVersion: string | null;
  engine: WorkerEngineIdentity | null;
  capabilities: WorkerCapabilityId[];
};

export const unconfiguredMobileWorker = (): MobileWorkerNegotiation => ({
  status: "unconfigured",
  message: "No compute worker configured.",
  protocol: null,
  serverVersion: null,
  engine: null,
  capabilities: [],
});

export const negotiatingMobileWorker = (): MobileWorkerNegotiation => ({
  ...unconfiguredMobileWorker(),
  status: "negotiating",
  message: "Negotiating worker capabilities...",
});

export const evaluateMobileWorkerCapabilities = (
  response: CgalVersionResponse,
  expectedProtocol: string
): MobileWorkerNegotiation => {
  if (!response.ok) {
    return {
      ...unconfiguredMobileWorker(),
      status: "unavailable",
      message: response.error || "Worker version request failed.",
    };
  }

  const protocol = typeof response.protocol === "string" ? response.protocol : null;
  const serverVersion = typeof response.serverVersion === "string" ? response.serverVersion : null;
  const engine = response.engine && typeof response.engine.id === "string" && typeof response.engine.version === "string"
    ? response.engine
    : null;
  const capabilities = Array.isArray(response.capabilities)
    ? [...new Set(response.capabilities.filter((value): value is WorkerCapabilityId => typeof value === "string"))]
    : [];

  if (protocol !== expectedProtocol) {
    return {
      status: "incompatible",
      message: protocol
        ? `Worker protocol ${protocol} is incompatible with ${expectedProtocol}.`
        : "Worker did not report a protocol version.",
      protocol,
      serverVersion,
      engine,
      capabilities,
    };
  }

  if (!serverVersion || !engine) {
    return {
      status: "incompatible",
      message: "Worker did not report its server and engine identity.",
      protocol,
      serverVersion,
      engine,
      capabilities,
    };
  }

  if (capabilities.length === 0) {
    return {
      status: "incompatible",
      message: "Worker did not advertise any named capabilities.",
      protocol,
      serverVersion,
      engine,
      capabilities,
    };
  }

  return {
    status: "ready",
    message: `Ready: ${capabilities.length} capabilities from ${engine.id} ${engine.version}.`,
    protocol,
    serverVersion,
    engine,
    capabilities,
  };
};

export const mobileWorkerHasCapability = (
  negotiation: MobileWorkerNegotiation,
  capability: WorkerCapabilityId
): boolean => negotiation.status === "ready" && negotiation.capabilities.includes(capability);
