import type { SurfaceComputationId, SurfaceCurvatureScalar } from "../components/SurfaceAnalysisWorkspacePanels";

export type SurfaceAnalysisPresetLayer =
  | "curvature-field"
  | "principal-directions"
  | "local-probe"
  | "tangent-frame"
  | "principal-lines"
  | "ridges"
  | "valleys"
  | "umbilics"
  | "parabolic-set"
  | "chart-grid"
  | "seams"
  | "orientation";

export type SurfaceAnalysisPreset = {
  id: string;
  label: string;
  description: string;
  focus: SurfaceComputationId;
  layers: readonly SurfaceAnalysisPresetLayer[];
  curvature?: {
    scalar: SurfaceCurvatureScalar;
    palette: "blueRed" | "rainbow" | "grayscale" | "redYellow";
    rangeMode: "automatic" | "percentile" | "symmetric";
    directions: boolean;
  };
  probe?: boolean;
  curves?: { principal: boolean };
  features?: { ridges: boolean; valleys: boolean; featureClass: "umbilic" | "parabolic" };
  chart?: boolean;
};

export const SURFACE_ANALYSIS_PRESETS: readonly SurfaceAnalysisPreset[] = [
  {
    id: "curvature-atlas",
    label: "Curvature atlas",
    description: "Gaussian curvature with a signed range and principal directions.",
    focus: "curvature-field",
    layers: ["curvature-field", "principal-directions"],
    curvature: { scalar: "K", palette: "blueRed", rangeMode: "symmetric", directions: true },
  },
  {
    id: "local-frame",
    label: "Local frame",
    description: "Curvature plus a probe, normal, tangent plane, and principal frame.",
    focus: "surface-probe",
    layers: ["curvature-field", "local-probe", "tangent-frame", "principal-directions"],
    curvature: { scalar: "H", palette: "redYellow", rangeMode: "percentile", directions: true },
    probe: true,
  },
  {
    id: "principal-flow",
    label: "Principal flow",
    description: "First-principal-curvature field with both principal line families.",
    focus: "surface-curves",
    layers: ["curvature-field", "principal-directions", "principal-lines"],
    curvature: { scalar: "k1", palette: "rainbow", rangeMode: "percentile", directions: true },
    curves: { principal: true },
  },
  {
    id: "feature-map",
    label: "Feature map",
    description: "Signed curvature with ridge, valley, umbilic, and parabolic layers.",
    focus: "surface-features",
    layers: ["curvature-field", "ridges", "valleys", "umbilics", "parabolic-set"],
    curvature: { scalar: "K", palette: "blueRed", rangeMode: "symmetric", directions: false },
    features: { ridges: true, valleys: true, featureClass: "parabolic" },
  },
  {
    id: "chart-seams",
    label: "Chart + seams",
    description: "Parameter grid, boundaries, seams, and orientation diagnostics.",
    focus: "chart-diagnostics",
    layers: ["chart-grid", "seams", "orientation"],
    chart: true,
  },
] as const;

export const getSurfaceAnalysisPreset = (id: string): SurfaceAnalysisPreset | null =>
  SURFACE_ANALYSIS_PRESETS.find((preset) => preset.id === id) ?? null;

export const validateSurfaceAnalysisPresets = (presets = SURFACE_ANALYSIS_PRESETS): string[] => {
  const issues: string[] = [];
  const ids = new Set<string>();
  presets.forEach((preset) => {
    if (ids.has(preset.id)) issues.push(`Duplicate preset ID: ${preset.id}`);
    ids.add(preset.id);
    if (!preset.layers.length) issues.push(`Preset has no layers: ${preset.id}`);
    if (preset.focus === "curvature-field" && !preset.curvature) issues.push(`Curvature preset lacks curvature settings: ${preset.id}`);
    if (preset.focus === "surface-probe" && !preset.probe) issues.push(`Probe preset lacks probe activation: ${preset.id}`);
    if (preset.focus === "surface-curves" && !preset.curves) issues.push(`Curve preset lacks curve settings: ${preset.id}`);
    if (preset.focus === "surface-features" && !preset.features) issues.push(`Feature preset lacks feature settings: ${preset.id}`);
    if (preset.focus === "chart-diagnostics" && !preset.chart) issues.push(`Chart preset lacks chart activation: ${preset.id}`);
  });
  return issues;
};
