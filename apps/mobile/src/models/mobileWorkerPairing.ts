export const MOBILE_WORKER_PAIRING_SCHEME = "math3d:";
export const MOBILE_WORKER_PAIRING_HOST = "worker-pair";

export type MobileWorkerPairing = {
  endpoint: string;
  token: string;
  expiresAt: number;
  protocol: string;
};

export type MobileWorkerPairingResult =
  | { ok: true; pairing: MobileWorkerPairing }
  | { ok: false; error: string };

const normalizeEndpoint = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
};

export const parseMobileWorkerPairing = (
  rawValue: string,
  expectedProtocol: string,
  now = Date.now()
): MobileWorkerPairingResult => {
  let payload: URL;
  try {
    payload = new URL(rawValue.trim());
  } catch {
    return { ok: false, error: "Pairing QR code is not a valid URL." };
  }

  if (payload.protocol !== MOBILE_WORKER_PAIRING_SCHEME || payload.hostname !== MOBILE_WORKER_PAIRING_HOST) {
    return { ok: false, error: "This QR code is not a Math3D worker pairing code." };
  }

  const endpoint = normalizeEndpoint(payload.searchParams.get("endpoint") || "");
  const token = payload.searchParams.get("token")?.trim() || "";
  const protocol = payload.searchParams.get("protocol")?.trim() || "";
  const expiresAt = Number(payload.searchParams.get("expires"));

  if (!endpoint) return { ok: false, error: "Pairing code contains an invalid worker endpoint." };
  if (token.length < 32) return { ok: false, error: "Pairing code contains an invalid temporary token." };
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, error: "Pairing code has expired. Generate a new code on the desktop." };
  }
  if (protocol !== expectedProtocol) {
    return {
      ok: false,
      error: `Pairing code uses worker protocol ${protocol || "unknown"}; expected ${expectedProtocol}.`,
    };
  }

  return { ok: true, pairing: { endpoint, token, expiresAt, protocol } };
};
