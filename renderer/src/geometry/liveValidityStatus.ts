export type GeometryLiveValidityKind =
  | "valid"
  | "needs-point"
  | "missing-source"
  | "broken-dependency";

export type GeometryLiveValidityMeta = {
  kind: GeometryLiveValidityKind;
  label: string;
  color: string;
  background: string;
  border: string;
};

const LIVE_VALIDITY_META: Record<GeometryLiveValidityKind, GeometryLiveValidityMeta> = {
  valid: {
    kind: "valid",
    label: "Valid",
    color: "#16a34a",
    background: "#f0fdf4",
    border: "#86efac",
  },
  "needs-point": {
    kind: "needs-point",
    label: "Needs point",
    color: "#ca8a04",
    background: "#fefce8",
    border: "#fde047",
  },
  "missing-source": {
    kind: "missing-source",
    label: "Missing source",
    color: "#ea580c",
    background: "#fff7ed",
    border: "#fdba74",
  },
  "broken-dependency": {
    kind: "broken-dependency",
    label: "Broken dependency",
    color: "#dc2626",
    background: "#fef2f2",
    border: "#fca5a5",
  },
};

export const getGeometryLiveValidityMetaByKind = (kind: GeometryLiveValidityKind): GeometryLiveValidityMeta =>
  LIVE_VALIDITY_META[kind];

export const getGeometryLiveValidityMeta = (
  status: "valid" | "broken-source" | "invalid" | undefined,
  statusMessage?: string | null
): GeometryLiveValidityMeta => {
  if (status === "valid") return LIVE_VALIDITY_META.valid;
  if (status === "broken-source") return LIVE_VALIDITY_META["missing-source"];

  const message = statusMessage?.toLowerCase() ?? "";
  if (/\bneeds?\b[^.]*\bpoint\b/.test(message) || /\bpoint\b[^.]*\b(required|needed|missing)\b/.test(message)) {
    return LIVE_VALIDITY_META["needs-point"];
  }
  if (/\bmissing source\b/.test(message)) return LIVE_VALIDITY_META["missing-source"];

  return LIVE_VALIDITY_META["broken-dependency"];
};
