import { validateSceneDocument, type SceneDocument } from "@math3d/core";

export const MOBILE_PROJECT_TEMPLATE_FORMAT = "math3d.mobile-project-template" as const;
export const MOBILE_PROJECT_TEMPLATE_SCHEMA_VERSION = 1 as const;

export type MobileProjectTemplate = Readonly<{
  format: typeof MOBILE_PROJECT_TEMPLATE_FORMAT;
  schemaVersion: typeof MOBILE_PROJECT_TEMPLATE_SCHEMA_VERSION;
  id: string;
  version: number;
  title: string;
  description: string;
  scene: SceneDocument;
}>;

const template = (
  id: string,
  title: string,
  description: string,
  surfaces: NonNullable<SceneDocument["surfaces"]>,
  purpose: string
): MobileProjectTemplate => ({
  format: MOBILE_PROJECT_TEMPLATE_FORMAT,
  schemaVersion: MOBILE_PROJECT_TEMPLATE_SCHEMA_VERSION,
  id,
  version: 1,
  title,
  description,
  scene: {
    id: `template-${id}`,
    title,
    createdAt: 0,
    updatedAt: 0,
    surfaces,
    metadata: { "math3d.template.purpose": purpose },
  },
});

export const mobileProjectTemplates: readonly MobileProjectTemplate[] = [
  template("empty-3d-scene", "Empty 3D Scene", "A clean project for creating objects from scratch.", [], "authoring"),
  template("surface-study", "Surface Study", "Compare an explicit graph with a parametric surface.", [
    { id: "saddle", kind: "explicit", expression: "x*x-y*y", domain: { xSpan: 2.6, ySpan: 2.6 }, resolution: 72 },
    { id: "torus", kind: "parametric", xExpr: "(1.6+0.45*cos(v))*cos(u)", yExpr: "(1.6+0.45*cos(v))*sin(u)", zExpr: "0.45*sin(v)", domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI }, resolution: 72 },
  ], "surface-comparison"),
  template("mesh-inspection", "Mesh Inspection", "A bounded placeholder mesh ready for inspection and replacement.", [
    { id: "inspection-mesh", kind: "mesh", source: "template://unit-cube" },
  ], "mesh-inspection"),
  template("curvature-analysis", "Curvature Analysis", "A smooth saddle prepared for curvature exploration.", [
    { id: "curvature-saddle", kind: "explicit", expression: "0.45*(x*x-y*y)", domain: { xSpan: 2.4, ySpan: 2.4 }, resolution: 88 },
  ], "curvature-analysis"),
  template("topology-study", "Topology Study", "A torus for components, boundaries, and Euler characteristic study.", [
    { id: "topology-torus", kind: "parametric", xExpr: "(1.7+0.5*cos(v))*cos(u)", yExpr: "(1.7+0.5*cos(v))*sin(u)", zExpr: "0.5*sin(v)", domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI }, resolution: 84 },
  ], "topology-analysis"),
  template("implicit-surface-study", "Implicit Surface Study", "An implicit gyroid definition ready for worker computation.", [
    { id: "implicit-gyroid", kind: "implicit", expression: "sin(x)*cos(y)+sin(y)*cos(z)+sin(z)*cos(x)", domain: { xSpan: 3.2, ySpan: 3.2, zSpan: 3.2 }, resolution: 80 },
  ], "implicit-analysis"),
] as const;

export const validateMobileProjectTemplate = (
  value: MobileProjectTemplate
): { ok: true } | { ok: false; errors: string[] } => {
  const errors: string[] = [];
  if (value.format !== MOBILE_PROJECT_TEMPLATE_FORMAT) errors.push("Template format is invalid.");
  if (value.schemaVersion !== MOBILE_PROJECT_TEMPLATE_SCHEMA_VERSION) errors.push("Template schema version is unsupported.");
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(value.id)) errors.push("Template ID must be a lowercase stable identifier.");
  if (!Number.isSafeInteger(value.version) || value.version < 1) errors.push("Template version must be a positive safe integer.");
  if (!value.title.trim()) errors.push("Template title is required.");
  if (!value.description.trim()) errors.push("Template description is required.");
  const scene = validateSceneDocument(value.scene);
  if (!scene.ok) errors.push(...scene.errors);
  const surfaceIds = (value.scene.surfaces ?? []).map((surface) => surface.id);
  if (new Set(surfaceIds).size !== surfaceIds.length) errors.push("Template surface IDs must be unique.");
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
};

export const validateBundledMobileProjectTemplates = (): { ok: true } | { ok: false; errors: string[] } => {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const entry of mobileProjectTemplates) {
    if (ids.has(entry.id)) errors.push(`Template ID '${entry.id}' is duplicated.`);
    ids.add(entry.id);
    const result = validateMobileProjectTemplate(entry);
    if (!result.ok) errors.push(...result.errors.map((error) => `${entry.id}: ${error}`));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
};
