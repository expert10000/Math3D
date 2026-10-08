/** Presentation settings for the native Surface viewer; separate from scientific source commands. */
export type SurfaceDocumentView = {
  resolution: number;
  lightPreset: "studio" | "soft" | "contrast" | "neutral" | "warm";
  roughness: number;
  metalness: number;
  opacity: number;
  showPlanes: boolean;
  showPrincipalDirections: boolean;
  showPrincipalLines: boolean;
  showCurvatureLines: boolean;
  showProbeNormal: boolean;
  showProbeTangentPlane: boolean;
  showProbeTangents: boolean;
};
export const DEFAULT_SURFACE_DOCUMENT_VIEW: SurfaceDocumentView = {
  resolution: 64, lightPreset: "studio", roughness: 0.55, metalness: 0.05, opacity: 1,
  showPlanes: false, showPrincipalDirections: false, showPrincipalLines: false, showCurvatureLines: false,
  showProbeNormal: true, showProbeTangentPlane: false, showProbeTangents: false,
};
export function readSurfaceDocumentView(value: unknown): SurfaceDocumentView {
  const settings = value && typeof value === "object" ? value as Partial<SurfaceDocumentView> : {};
  const number = (key: "resolution" | "roughness" | "metalness" | "opacity", min: number, max: number) => typeof settings[key] === "number" && Number.isFinite(settings[key])
    ? Math.max(min, Math.min(max, settings[key]!)) : DEFAULT_SURFACE_DOCUMENT_VIEW[key];
  return { resolution: Math.round(number("resolution", 8, 220)), roughness: number("roughness", 0, 1), metalness: number("metalness", 0, 1), opacity: number("opacity", 0.1, 1),
    lightPreset: ["studio", "soft", "contrast", "neutral", "warm"].includes(settings.lightPreset ?? "") ? settings.lightPreset! : "studio",
    showPlanes: settings.showPlanes === true, showPrincipalDirections: settings.showPrincipalDirections === true,
    showPrincipalLines: settings.showPrincipalLines === true, showCurvatureLines: settings.showCurvatureLines === true,
    showProbeNormal: settings.showProbeNormal !== false, showProbeTangentPlane: settings.showProbeTangentPlane === true, showProbeTangents: settings.showProbeTangents === true };
}
