import type { GeometryPickResult } from "../geometry/picking";

type Vec3Object = { x: number; y: number; z: number };
type Vec3Tuple = [number, number, number];

export type GeometryPickReadoutDetails = {
  objectLabel: string;
  objectType: string;
  stale: boolean;
  tangentKind: GeometryPickResult["tangentKind"] | null;
  barycentric: Vec3Tuple | null;
  sourceTriangle: Vec3Tuple | null;
  edgeLength: number | null;
  faceArea: number | null;
  vertexTopology: GeometryPickResult["vertexTopology"] | null;
  edgeTopology: GeometryPickResult["edgeTopology"] | null;
  faceTopology: GeometryPickResult["faceTopology"] | null;
  faceIndex: number | null;
  vertexIndex: number | null;
  edgeVertexPair: [number, number] | null;
  edgeKey: string | null;
};

export type GeometryPickReadoutMeshInfo = {
  vertCount: number;
  triCount: number;
  bounds?: {
    min: Vec3Tuple;
    max: Vec3Tuple;
  } | null;
};

export type GeometryPickReadoutEdgeMeaning = {
  type: string;
  directionLabel: string;
  curve: string;
  supportingLine: string;
  normal: Vec3Object;
  tangent: Vec3Object | null;
};

type GeometryPickReadoutProps = {
  hoverPick: GeometryPickResult | null;
  selectedPick: GeometryPickResult | null;
  selectionDetails: GeometryPickReadoutDetails | null;
  selectedObjectName?: string | null;
  selectedObjectType?: string | null;
  selectedSceneMeshInfo?: GeometryPickReadoutMeshInfo | null;
  selectedEdgeMeaning?: GeometryPickReadoutEdgeMeaning | null;
};

const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
const fmtVec3 = (v: Vec3Object) => `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;
const fmtTuple3 = (v?: Vec3Tuple | null) => (v ? `(${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])})` : "none");
const formatPickEntity = (pick: GeometryPickResult | null | undefined) => pick?.label ?? "none";

export const GeometryPickReadout = ({
  hoverPick,
  selectedPick,
  selectionDetails,
  selectedObjectName,
  selectedObjectType,
  selectedSceneMeshInfo,
  selectedEdgeMeaning,
}: GeometryPickReadoutProps) => (
  <>
    <div data-testid="geometry-pick-hover" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700 }}>Hover</div>
      <div style={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: "4px 8px" }}>
        <div style={{ color: "#556" }}>Entity</div>
        <div>{formatPickEntity(hoverPick)}</div>
        <div style={{ color: "#556" }}>Point</div>
        <div>{fmtTuple3(hoverPick?.worldPoint)}</div>
      </div>
    </div>

    <div data-testid="geometry-pick-committed" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700 }}>Committed Entity</div>
      <div style={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: "4px 8px" }}>
        <div style={{ color: "#556" }}>Entity</div>
        <div data-testid="geometry-pick-committed-entity">{formatPickEntity(selectedPick)}</div>
        <div style={{ color: "#556" }}>Object</div>
        <div data-testid="geometry-pick-committed-object" data-object-id={selectedPick?.objectId ?? ""}>
          {selectionDetails?.objectLabel ?? selectedObjectName ?? "none"}
        </div>
        <div style={{ color: "#556" }}>Type</div>
        <div data-testid="geometry-pick-committed-type">{selectionDetails?.objectType ?? selectedObjectType ?? "n/a"}</div>
        <div style={{ color: "#556" }}>Status</div>
        <div data-testid="geometry-pick-committed-status">{selectionDetails?.stale ? "stale" : selectedPick ? "valid" : "none"}</div>
        {selectedPick?.kind === "object" ? (
          <>
            <div style={{ color: "#556" }}>Object id</div>
            <div data-testid="geometry-pick-object-id">{selectedPick.objectId}</div>
            <div style={{ color: "#556" }}>Vertices/Faces</div>
            <div>
              {selectedSceneMeshInfo
                ? `${selectedSceneMeshInfo.vertCount.toLocaleString()} / ${selectedSceneMeshInfo.triCount.toLocaleString()}`
                : "n/a"}
            </div>
            <div style={{ color: "#556" }}>Bounds</div>
            <div>
              {selectedSceneMeshInfo?.bounds
                ? `min (${fmt(selectedSceneMeshInfo.bounds.min[0])}, ${fmt(selectedSceneMeshInfo.bounds.min[1])}, ${fmt(selectedSceneMeshInfo.bounds.min[2])}) | max (${fmt(selectedSceneMeshInfo.bounds.max[0])}, ${fmt(selectedSceneMeshInfo.bounds.max[1])}, ${fmt(selectedSceneMeshInfo.bounds.max[2])})`
                : "n/a"}
            </div>
          </>
        ) : (
          <>
            <div style={{ color: "#556" }}>World point</div>
            <div data-testid="geometry-pick-world-point">{fmtTuple3(selectedPick?.worldPoint)}</div>
            {selectedPick?.faceNormal && (
              <>
                <div style={{ color: "#556" }}>
                  {selectedPick.kind === "edge"
                    ? "Compatible normal"
                    : selectedPick.kind === "vertex"
                      ? "Source face normal"
                      : "Geometric normal"}
                </div>
                <div>{fmtTuple3(selectedPick.faceNormal)}</div>
              </>
            )}
            {selectedPick?.surfaceNormal && (
              <>
                <div style={{ color: "#556" }}>Shading normal</div>
                <div>{fmtTuple3(selectedPick.surfaceNormal)}</div>
              </>
            )}
            {selectedPick?.vertexNormal && (
              <>
                <div style={{ color: "#556" }}>Vertex normal</div>
                <div>{fmtTuple3(selectedPick.vertexNormal)}</div>
              </>
            )}
            {selectedPick?.tangent && (
              <>
                <div style={{ color: "#556" }}>{selectionDetails?.tangentKind === "edge-direction" ? "Edge tangent" : "Tangent 1"}</div>
                <div>{fmtTuple3(selectedPick.tangent)}</div>
              </>
            )}
            {selectedPick?.bitangent && (
              <>
                <div style={{ color: "#556" }}>{selectionDetails?.tangentKind === "edge-direction" ? "Side tangent" : "Tangent 2"}</div>
                <div>{fmtTuple3(selectedPick.bitangent)}</div>
              </>
            )}
            {selectedPick?.kind === "vertex" && selectedPick.vertexNormal && (
              <>
                <div style={{ color: "#556" }}>Tangent plane</div>
                <div>defined by vertex normal</div>
              </>
            )}
            {selectedPick?.kind === "face" && (
              <>
                <div style={{ color: "#556" }}>Face</div>
                <div>
                  <span data-testid="geometry-pick-face">
                    #{selectionDetails?.faceIndex ?? "n/a"}
                    {selectionDetails?.sourceTriangle ? ` | triangle [${selectionDetails.sourceTriangle.join(", ")}]` : ""}
                  </span>
                </div>
                <div style={{ color: "#556" }}>Barycentric</div>
                <div>{fmtTuple3(selectionDetails?.barycentric)}</div>
                <div style={{ color: "#556" }}>Face area</div>
                <div>{selectionDetails?.faceArea != null && Number.isFinite(selectionDetails.faceArea) ? fmt(selectionDetails.faceArea) : "n/a"}</div>
                <div style={{ color: "#556" }}>Adjacent faces</div>
                <div data-testid="geometry-pick-face-adjacent-count">
                  {selectionDetails?.faceTopology ? selectionDetails.faceTopology.adjacentFaces.toLocaleString() : "n/a"}
                </div>
              </>
            )}
            {selectedPick?.kind === "edge" && (
              <>
                <div style={{ color: "#556" }}>Edge</div>
                <div>
                  <span data-testid="geometry-pick-edge">
                    {selectionDetails?.edgeVertexPair
                      ? `[${selectionDetails.edgeVertexPair[0]}, ${selectionDetails.edgeVertexPair[1]}]`
                      : "n/a"}
                  </span>
                </div>
                <div style={{ color: "#556" }}>Edge key</div>
                <div>{selectionDetails?.edgeKey ?? "n/a"}</div>
                <div style={{ color: "#556" }}>Edge length</div>
                <div>{selectionDetails?.edgeLength != null && Number.isFinite(selectionDetails.edgeLength) ? fmt(selectionDetails.edgeLength) : "n/a"}</div>
                <div style={{ color: "#556" }}>Adjacent faces</div>
                <div data-testid="geometry-pick-edge-incident-count">
                  {selectionDetails?.edgeTopology ? selectionDetails.edgeTopology.incidentFaces.toLocaleString() : "n/a"}
                </div>
                <div style={{ color: "#556" }}>Boundary</div>
                <div>{selectionDetails?.edgeTopology ? (selectionDetails.edgeTopology.boundary ? "yes" : "no") : "n/a"}</div>
                {selectedEdgeMeaning && (
                  <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                    <div
                      style={{
                        border: "1px solid #dbeafe",
                        borderRadius: 8,
                        background: "#f8fbff",
                        padding: "7px 8px",
                        display: "grid",
                        gap: 5,
                      }}
                    >
                      <strong>Geometry</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "112px 1fr", gap: "3px 8px" }}>
                        <span style={{ color: "#556" }}>Type</span>
                        <span>{selectedEdgeMeaning.type}</span>
                        <span style={{ color: "#556" }}>Direction</span>
                        <span>{selectedEdgeMeaning.directionLabel}</span>
                        <span style={{ color: "#556" }}>Underlying curve</span>
                        <span>{selectedEdgeMeaning.curve}</span>
                        <span style={{ color: "#556" }}>Supporting line</span>
                        <span>{selectedEdgeMeaning.supportingLine}</span>
                        <span style={{ color: "#556" }}>Normal</span>
                        <span>{fmtVec3(selectedEdgeMeaning.normal)}</span>
                        <span style={{ color: "#556" }}>Tangent</span>
                        <span>{selectedEdgeMeaning.tangent ? fmtVec3(selectedEdgeMeaning.tangent) : "n/a"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {selectedPick?.kind === "vertex" && (
              <>
                <div style={{ color: "#556" }}>Vertex</div>
                <div>
                  <span data-testid="geometry-pick-vertex">
                    {selectionDetails?.vertexIndex != null ? `#${selectionDetails.vertexIndex}` : "n/a"}
                  </span>
                </div>
                <div style={{ color: "#556" }}>Connected edges</div>
                <div data-testid="geometry-pick-vertex-edge-count">
                  {selectionDetails?.vertexTopology ? selectionDetails.vertexTopology.incidentEdges.toLocaleString() : "n/a"}
                </div>
                <div style={{ color: "#556" }}>Connected faces</div>
                <div data-testid="geometry-pick-vertex-face-count">
                  {selectionDetails?.vertexTopology ? selectionDetails.vertexTopology.incidentFaces.toLocaleString() : "n/a"}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  </>
);
