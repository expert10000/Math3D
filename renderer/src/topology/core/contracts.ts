import type { FundamentalDiagram, Orientation, Realization3D } from "../types";

export const TOPOLOGY_CANONICAL_SCHEMA_VERSION = 1 as const;
export const TOPOLOGY_CANONICALIZER_VERSION = "fundamental-diagram-quotient@1" as const;

export type TopologySourceCellDimension = 0 | 1 | 2;

export type CWComplexInput = {
  id: string;
  name: string;
  vertices: Array<{ id: string; name?: string }>;
  edges: Array<{ id: string; name?: string; endpoints: [string, string] }>;
  faces: Array<{
    id: string;
    name?: string;
    attachment: Array<{ edgeId: string; direction: Orientation }>;
  }>;
};
export type SimplicialComplexInput = {
  id: string;
  name: string;
  vertexIds: string[];
  edges: Array<{ id: string; vertices: [string, string] }>;
  triangles: Array<{ id: string; vertices: [string, string, string] }>;
};

export type MeshTopologySnapshot = {
  id: string;
  name: string;
  sourceObjectId: string;
  sourceObjectRevision: string;
  vertexIds: string[];
  edges: Array<{ id: string; vertices: [string, string] }>;
  faces: Array<{ id: string; vertexIds: string[] }>;
};

export type GeometryTopologySnapshot = {
  id: string;
  name: string;
  sourceObjectId: string;
  sourceObjectRevision: string;
  representation: "curve-network" | "surface-tessellation" | "solid-boundary";
  vertexIds: string[];
  edges: Array<{ id: string; vertices: [string, string] }>;
  faces: Array<{ id: string; vertexIds: string[] }>;
};

export type TopologySource =
  | { kind: "fundamental-diagram"; value: FundamentalDiagram }
  | { kind: "cw-complex"; value: CWComplexInput }
  | { kind: "simplicial-complex"; value: SimplicialComplexInput }
  | { kind: "mesh-snapshot"; value: MeshTopologySnapshot }
  | { kind: "geometry-snapshot"; value: GeometryTopologySnapshot };

export type CanonicalSourceCellReference = {
  stage: "source" | "refinement";
  dimension: TopologySourceCellDimension;
  cellId: string;
};

export type CanonicalTopologyVertex = {
  id: string;
  name: string;
  sourceRefs: CanonicalSourceCellReference[];
};

export type CanonicalTopologyEdge = {
  id: string;
  name: string;
  /** Ordered endpoints define the positive orientation. Loops repeat one vertex ID. */
  endpoints: [string, string];
  sourceRefs: CanonicalSourceCellReference[];
};

export type CanonicalTopologyFace = {
  id: string;
  name: string;
  /** Finite closed oriented edge word, checked by canonical structural validation. */
  attachment: Array<{ edgeId: string; direction: Orientation }>;
  boundaryWord: string;
  sourceRefs: CanonicalSourceCellReference[];
};

export type CanonicalTopologyComplex = {
  schemaVersion: typeof TOPOLOGY_CANONICAL_SCHEMA_VERSION;
  dimension: 2;
  id: string;
  name: string;
  vertices: CanonicalTopologyVertex[];
  edges: CanonicalTopologyEdge[];
  faces: CanonicalTopologyFace[];
  incidences: {
    vertexToEdges: Record<string, string[]>;
    edgeToFaces: Record<string, string[]>;
  };
};

export type TopologyProvenance = {
  source: {
    kind: TopologySource["kind"];
    revision: string;
    hash: string;
  };
  canonicalization: {
    method: "fundamental-diagram quotient canonicalization";
    algorithmVersion: typeof TOPOLOGY_CANONICALIZER_VERSION;
    revision: string;
    hash: string;
  };
};

export type TopologyDiagnosticSeverity = "info" | "warning" | "error";

export type TopologyDiagnostic = {
  code: string;
  severity: TopologyDiagnosticSeverity;
  message: string;
  cellRef?: { dimension: TopologySourceCellDimension; cellId: string };
};

export type TopologyResultStatus =
  | "exact"
  | "certified-within-model"
  | "recognized"
  | "heuristic"
  | "unknown"
  | "unsupported"
  | "failed";

export type TopologyResult<T> = {
  status: TopologyResultStatus;
  value?: T;
  method: string;
  assumptions: string[];
  sourceRevision: string;
  algorithmVersion: string;
  diagnostics: TopologyDiagnostic[];
};

export type TopologyAnalysisResult = Record<string, TopologyResult<unknown>>;

export type TopologyObject = {
  id: string;
  name: string;
  /** The source is authoritative; canonical data and realizations are derived. */
  source: TopologySource;
  canonical: CanonicalTopologyComplex;
  provenance: TopologyProvenance;
  analysis?: TopologyAnalysisResult;
  /** R3 views never define the topology. */
  realizations: Realization3D[];
};
