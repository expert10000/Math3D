export type Orientation = 1 | -1;

export type FundamentalDiagramVertex = {
  id: string;
  x: number;
  y: number;
};

export type FundamentalDiagramEdge = {
  id: string;
  from: string;
  to: string;
};

export type FundamentalDiagramBoundaryHalfEdge = {
  edgeId: string;
  direction: Orientation;
};

export type FundamentalDiagramFace = {
  id: string;
  boundary: FundamentalDiagramBoundaryHalfEdge[];
};

export type FundamentalDiagramMetadata = {
  description?: string;
  annotations?: string[];
  styling?: {
    diagramStroke?: string;
    diagramFill?: string;
  };
};

export type FundamentalDiagram = {
  id: string;
  name: string;
  vertices: FundamentalDiagramVertex[];
  edges: FundamentalDiagramEdge[];
  faces: FundamentalDiagramFace[];
  edgeOrientations: Record<string, Orientation>;
  edgeLabels: Record<string, string>;
  edgePairings: Record<string, string[]>;
  vertexLabels: Record<string, string>;
  faceBoundaryWords: Record<string, string>;
  metadata?: FundamentalDiagramMetadata;
};

export type QuotientWarningLevel = "info" | "warning" | "error";

export type QuotientWarning = {
  code: string;
  level: QuotientWarningLevel;
  message: string;
  edgeId?: string;
  faceId?: string;
  vertexId?: string;
};

export type EquivalenceClass = {
  id: string;
  sourceIds: string[];
};

export type OrientationRelation = {
  edgeA: string;
  edgeB: string;
  relation: "match" | "reverse";
};

export type QuotientVertex = {
  id: string;
  sourceVertexIds: string[];
  label: string;
};

export type QuotientEdge = {
  id: string;
  sourceEdgeIds: string[];
  label: string;
  endpointVertexIds: [string, string];
};

export type QuotientFace = {
  id: string;
  sourceFaceIds: string[];
  attachmentId: string;
};

export type QuotientFaceAttachment = {
  id: string;
  faceId: string;
  boundary: Array<{ edgeId: string; direction: Orientation }>;
  boundaryWord: string;
};

export type QuotientIncidence = {
  vertexToEdges: Record<string, string[]>;
  edgeToFaces: Record<string, string[]>;
};

export type QuotientCellBoundary = {
  faceId: string;
  edgeWalk: Array<{ edgeId: string; direction: Orientation }>;
};

export type QuotientSimplicialRefinement = {
  source: "face-fan";
  triangles: Array<{ id: string; sourceFaceId: string; vertices: [string, string, string] }>;
};

export type QuotientInvariantsSummary = {
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
  eulerCharacteristic: number;
  connectedComponents: number;
  isConnected: boolean;
  nonManifoldEdgeCount: number;
};

export type QuotientComplex = {
  id: string;
  name: string;
  vertices: QuotientVertex[];
  edges: QuotientEdge[];
  faces: QuotientFace[];
  incidences: QuotientIncidence;
  attachmentMap: Record<string, QuotientFaceAttachment>;
  cellBoundaries: QuotientCellBoundary[];
  simplicialRefinement?: QuotientSimplicialRefinement | null;
  invariants?: QuotientInvariantsSummary;
};

export type Vec3 = [number, number, number];

export type RealizedFaceMesh = {
  faceId: string;
  vertices: Vec3[];
  triangles: Array<[number, number, number]>;
};

export type RealizationSeam = {
  edgeId: string;
  sourceEdgeIds: string[];
  kind: "identified" | "self-identified";
};

export type SingularityMarker = {
  vertexId: string;
  kind: "identified-vertex";
  degree: number;
};

export type RealizationStyle = {
  faceFill: string;
  edgeStroke: string;
  seamStroke: string;
  singularityColor: string;
};

export type TopologyRealizationKind = "embedded" | "immersed" | "schematic";

export type Realization3D = {
  id: string;
  name: string;
  /** Non-authoritative relationship between this R^3 display and the quotient. */
  kind: TopologyRealizationKind;
  quotientComplexId: string;
  vertexPositions: Record<string, Vec3>;
  edgeCurves: Record<string, Vec3[]>;
  faceRealizationMesh: RealizedFaceMesh[];
  seams: RealizationSeam[];
  singularityMarkers: SingularityMarker[];
  style: RealizationStyle;
};

export type PipelineStageId = "diagram" | "subdivide" | "equivalence" | "quotient" | "validation" | "boundary" | "homology" | "algebra" | "classification" | "realization" | "render";

export type QuotientPipelineStage = {
  id: PipelineStageId;
  label: string;
  status: "done" | "warning" | "error";
  note: string;
};

export type SubdivisionSummary = {
  applied: boolean;
  originalFaceCount: number;
  subdividedFaceCount: number;
  createdEdgeIds: string[];
  triangulatedFaceIds: string[];
  faceMap: Record<string, string[]>;
};

export type QuotientBuildResult = {
  normalizedDiagram: FundamentalDiagram;
  subdividedDiagram: FundamentalDiagram;
  subdivision: SubdivisionSummary;
  vertexClasses: EquivalenceClass[];
  edgeClasses: EquivalenceClass[];
  orientationRelations: OrientationRelation[];
  vertexClassBySource: Record<string, string>;
  edgeClassBySource: Record<string, string>;
  quotient: QuotientComplex;
  realizations: Realization3D[];
  warnings: QuotientWarning[];
  pipeline: QuotientPipelineStage[];
  /** Canonical source/derived/provenance contract for formal analysis consumers. */
  topologyObject: import("./core/contracts").TopologyObject;
  structuralValidation: import("./core/contracts").TopologyResult<
    import("./core/structuralValidation").TopologyStructuralValidationReport
  >;
  cellularBoundaryOperators: import("./core/contracts").TopologyResult<
    import("./core/cellularBoundary").CellularBoundaryOperators
  >;
  homology: import("./core/contracts").TopologyResult<
    import("./core/homology").TopologyHomologyAnalysis
  >;
  algebraicConsistency: import("./core/contracts").TopologyResult<
    import("./core/algebraicConsistency").TopologyAlgebraicConsistency
  >;
  surfaceClassification: import("./core/contracts").TopologyResult<
    import("./core/surfaceClassification").SurfaceClassificationReport
  >;
};
