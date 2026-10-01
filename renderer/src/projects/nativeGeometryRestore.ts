import { canonicalJsonStringify, geometryDocumentToSceneDocument, type CanonicalJsonValue, type GeometryDocument, type MixedWorkspaceDocument } from "@math3d/core";

export const LIVE_GEOMETRY_CONSTRUCTIONS = "math3d.geometry.live-derived.v1";
const supportedConstructions = new Set([
  "vertex-point-marker", "vertex-coordinate-label", "vertex-normal-endpoint", "vertex-translated-copy-point", "edge-midpoint", "edge-line-through-two-vertices", "edge-line-through-midpoint-and-vertex", "edge-direction-vector", "edge-perpendicular-bisector-line", "edge-aligned-axis", "edge-parallel-line-through-vertex", "edge-equal-length-copied-segment", "plane-normal-line-through-vertex", "face-centroid", "face-normal-line", "face-line-perpendicular-to-plane", "face-tangent-plane-preview", "face-plane-through-centroid", "face-plane-normal-to-selected-edge", "face-offset-plane", "face-parallel-face-plane", "face-plane-through-three-vertices", "line-pair-intersection-point", "line-pair-common-perpendicular", "line-pair-plane-through-lines", "line-pair-mid-plane", "line-pair-angle-marker", "object-centroid", "object-bounding-box", "object-principal-axes-preview", "object-principal-plane", "object-best-fit-plane", "object-symmetry-plane-preview", "object-circumscribed-sphere-preview", "object-inscribed-reference-sphere",
]);
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
export const geometryEditorSeed = (document: GeometryDocument) => {
  // Procedural objects and their live-derived constructions have a native adapter.
  // Point/scene primitives and separate canonical construction graphs use another UI.
  if (document.source.geometry || document.source.surfaces.length || document.source.constructions.length || document.source.relationships.length || document.display.overlays.length || document.display.cameras.length)
    throw new TypeError("This Geometry payload needs a different editor adapter.");
  const raw = document.source.extensions[LIVE_GEOMETRY_CONSTRUCTIONS] ?? [];
  if (!Array.isArray(raw) || raw.length > 80 || raw.some((entry) => !record(entry) || typeof entry.id !== "string" || !supportedConstructions.has(entry.type) || !["vertex", "edge", "face", "object"].includes(entry.sourceKind) || typeof entry.sourceObjectId !== "string" || typeof entry.dependent !== "boolean"))
    throw new TypeError("Unsupported Geometry construction state.");
  const scene = geometryDocumentToSceneDocument(document);
  return { objects: scene.objects ?? [], constructions: raw.map((entry) => ({ ...(entry as Record<string, any>), id: String((entry as Record<string, any>).id), ...document.display.constructions[(entry as Record<string, any>).id], createdAt: document.metadata.constructionCreatedAt[(entry as Record<string, any>).id] ?? document.display.constructions[(entry as Record<string, any>).id]?.createdAt ?? 0 })) };
};
export const geometryDocumentEditable = (document: GeometryDocument) => { try { geometryEditorSeed(document); return true; } catch { return false; } };
/** Copy editable native fields while preserving every other mathematical/display input. */
export const geometrySourceFromEditor = (saved: GeometryDocument, live: GeometryDocument) => {
  const raw = live.source.extensions[LIVE_GEOMETRY_CONSTRUCTIONS] ?? [];
  const savedConstructions = saved.source.extensions[LIVE_GEOMETRY_CONSTRUCTIONS];
  const current = Array.isArray(raw) ? raw.map((entry) => {
    if (!record(entry)) return entry;
    const previous = Array.isArray(savedConstructions) ? savedConstructions.find((item) => record(item) && item.id === entry.id) : undefined;
    if (!record(previous) || previous.sourceObjectId !== entry.sourceObjectId) return entry;
    // The viewer fills missing cache/qualification fields on mount. Preserve the
    // saved absence; that automatic lookup is not a mathematical source edit.
    const next = { ...entry };
    for (const key of ["sourceRevision", "sourceTopologySignature", "sourceFaceSignature", "sourceEdgeSignature", "sourceVertexSignature"])
      if (!(key in previous)) delete next[key];
    return next;
  }) : raw;
  const extensions = { ...saved.source.extensions };
  if (Object.prototype.hasOwnProperty.call(extensions, LIVE_GEOMETRY_CONSTRUCTIONS) || Array.isArray(current) && current.length) extensions[LIVE_GEOMETRY_CONSTRUCTIONS] = current;
  return { ...saved.source, objects: live.source.objects, extensions };
};
export const geometryDisplayFromEditor = (saved: GeometryDocument, live: GeometryDocument) => ({ ...saved.display, objects: live.display.objects, constructions: live.display.constructions });
export const projectConstructionsEditable = (workspace: MixedWorkspaceDocument) => {
  if (!workspace.constructions.length) return true;
  if (workspace.entries.filter((entry) => entry.module === "geometry").length !== 1) return false;
  const seed = (value: unknown) => record(value) && Array.isArray(value.nodes) && value.nodes.length > 0 && value.nodes.every((node: unknown) => record(node) && typeof node.id === "string") && Array.isArray(value.checkDefs) && value.checkDefs.every((check: unknown) => record(check) && typeof check.id === "string");
  const counts = new Map<string, number>();
  return workspace.constructions.every((entry) => {
    counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    if (counts.get(entry.kind)! > 1) return false;
    if (entry.kind === "scene-script") return typeof entry.source === "string";
    if (entry.kind === "scratch") return seed(entry.source);
    return entry.kind === "workbook" && record(entry.source) && Object.values(entry.source).every(seed);
  });
};

/** Restore-time defaults are not edits. Preserve absent and unmodeled seed fields. */
export const retainConstructionSource = (original: CanonicalJsonValue, normalized: unknown, live: unknown, workbook = false): CanonicalJsonValue => {
  const portable = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
  if (live === null || canonicalJsonStringify(portable(normalized)) === canonicalJsonStringify(portable(live))) return original;
  const current = portable(live);
  if (!record(original) || !record(current)) return current;
  const stored = original as Record<string, CanonicalJsonValue>;
  if (workbook) return Object.fromEntries(Object.entries(current).map(([id, value]) => [id, record(value) && record(stored[id]) ? { ...stored[id], ...value } : value]));
  return { ...original, ...current };
};
