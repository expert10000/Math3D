import type {
  CanonicalCurveDefinition,
  CurveIdentity,
  CurveRepresentation,
  CurveResultKind,
} from "./contracts";
import type { SemanticCurvePick } from "./probe";

export type SavedCurveResultReference = {
  id: string;
  resultKey: string;
  kind: CurveResultKind;
  variant: string;
  identity: CurveIdentity;
  label: string;
  visible: boolean;
};
export type CurveAnalysisWorkspaceDocument = {
  version: 1;
  definitions: CanonicalCurveDefinition[];
  savedResults: SavedCurveResultReference[];
  savedProbes: SemanticCurvePick[];
  annotations: SavedCurveAnnotation[];
};

export type CurveAnnotationKind = "distance" | "segment-length" | "point" | "parameter" | "curvature" | "torsion" | "radius" | "tangent" | "frame";
export type SavedCurveAnnotation = {
  id: string;
  pickId: string;
  identity: CurveIdentity;
  kind: CurveAnnotationKind;
  label: string;
  value: string;
  visible: boolean;
};

const REPRESENTATIONS: ReadonlySet<CurveRepresentation> = new Set([
  "parametric", "explicit", "implicit", "polar", "bezier", "b-spline", "nurbs", "polyline", "curve-on-surface", "derived",
]);

export const createCurveAnalysisWorkspaceDocument = (
  input?: Partial<CurveAnalysisWorkspaceDocument>
): CurveAnalysisWorkspaceDocument => ({
  version: 1,
  definitions: [...(input?.definitions ?? [])],
  savedResults: [...(input?.savedResults ?? [])],
  savedProbes: [...(input?.savedProbes ?? [])],
  annotations: [...(input?.annotations ?? [])],
});

export const serializeCurveAnalysisWorkspace = (document: CurveAnalysisWorkspaceDocument): string => JSON.stringify(document);

export const parseCurveAnalysisWorkspace = (serialized: string): CurveAnalysisWorkspaceDocument => {
  const value = JSON.parse(serialized) as Partial<CurveAnalysisWorkspaceDocument> | null;
  if (!value || value.version !== 1 || !Array.isArray(value.definitions) || !Array.isArray(value.savedResults)) {
    throw new Error("Unsupported Curve Analysis workspace document.");
  }
  for (const definition of value.definitions) {
    if (definition?.version !== 1 || !definition.fingerprint || !definition.identity || !REPRESENTATIONS.has(definition.representation)) {
      throw new Error("Invalid canonical Curve definition.");
    }
    if (definition.identity.curveId !== definition.identity.curveId.trim() || definition.identity.curveRevision < 0) {
      throw new Error("Invalid Curve identity.");
    }
    if (!Number.isFinite(definition.domain.min) || !Number.isFinite(definition.domain.max) || definition.domain.max <= definition.domain.min) {
      throw new Error("Invalid Curve domain.");
    }
  }
  for (const reference of value.savedResults) {
    if (!reference?.id || !reference.resultKey || !reference.identity || !reference.kind || !reference.variant) {
      throw new Error("Invalid saved Curve result reference.");
    }
  }
  if (value.savedProbes != null && !Array.isArray(value.savedProbes)) throw new Error("Invalid saved Curve probes.");
  if (value.annotations != null && !Array.isArray(value.annotations)) throw new Error("Invalid saved Curve annotations.");
  return createCurveAnalysisWorkspaceDocument({ ...value, savedProbes: value.savedProbes ?? [], annotations: value.annotations ?? [] });
};
