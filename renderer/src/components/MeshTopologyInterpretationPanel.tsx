import { useState } from "react";
import type { MeshDocument } from "@math3d/core";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { MeshTopologyInspectorDetails } from "../mesh/topologyInspector";
import type { MeshDiagnosticsAnalysisPayload } from "../mesh/analysisResultStore";
import { computeMeshTopologyInterpretations, type MeshTopologyInterpretations } from "../mesh/meshTopologyInterpretation";

type RecordedInterpretation = {
  mesh: SurfaceMeshData;
  sourceId: string;
  revision: number;
  structuralHash: string;
  checksum: string;
  comparison: MeshTopologyInterpretations;
};

const counts = (details: MeshTopologyInspectorDetails) => (
  <div style={{ display: "grid", gap: 3 }}>
    <div>Vertices {details.vertexCount} · Faces {details.faceCount} · Edges {details.edgeCount}</div>
    <div>Boundary edges {details.boundaryEdgeCount} · Boundary loops {details.boundaryLoops.length} · Non-manifold edges {details.nonManifoldEdgeCount} · Components {details.connectedComponentCount}</div>
    <div>Manifold {details.manifold ? "yes" : "no"} · Closed {details.closed ? "yes" : "no"} · Watertight {details.watertight ? "yes" : "no"}</div>
  </div>
);

export function MeshTopologyInterpretationPanel({ mesh, document, indexed, diagnostics }: {
  mesh: SurfaceMeshData | null;
  document: MeshDocument | null;
  indexed: MeshTopologyInspectorDetails | null;
  diagnostics: MeshDiagnosticsAnalysisPayload | null;
}) {
  const [toleranceText, setToleranceText] = useState("0.000001");
  const [recorded, setRecorded] = useState<RecordedInterpretation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stale = !!recorded && (
    recorded.mesh !== mesh ||
    recorded.sourceId !== document?.identity.id ||
    recorded.revision !== document?.identity.revision ||
    recorded.structuralHash !== document?.identity.structuralHash ||
    recorded.checksum !== document?.source.resource.checksum ||
    recorded.comparison.tolerance !== Number(toleranceText)
  );
  const closedSolidSuitability = !indexed ? "unknown" :
    indexed.nonManifoldEdgeCount > 0 || !indexed.manifold ? "no — non-manifold topology" :
    indexed.boundaryEdgeCount > 0 || !indexed.closed ? "no — open boundary" :
    !indexed.watertight ? "no — not watertight" : "candidate — confirm with full validation";
  const trianglesValid = diagnostics ?
    diagnostics.trianglesValid && diagnostics.invalidVertexCount === 0 && diagnostics.invalidFaceCount === 0 && diagnostics.degenerateTriangleCount === 0 : null;
  const selfIntersectionStatus = !diagnostics ? "unknown" :
    !diagnostics.selfIntersection.checked ? "not checked" :
    `${diagnostics.selfIntersection.suspectedPairs} suspected pair${diagnostics.selfIntersection.suspectedPairs === 1 ? "" : "s"} (sampled${diagnostics.selfIntersection.truncated ? ", truncated" : ""})`;

  const requestComparison = () => {
    const tolerance = Number(toleranceText);
    if (toleranceText.trim() === "" || !Number.isFinite(tolerance) || tolerance < 0) {
      setError("Enter a finite, non-negative tolerance.");
      return;
    }
    if (!mesh || !document || !indexed) return;
    try {
      setRecorded({
        mesh,
        sourceId: document.identity.id,
        revision: document.identity.revision,
        structuralHash: document.identity.structuralHash,
        checksum: document.source.resource.checksum,
        comparison: computeMeshTopologyInterpretations(mesh, tolerance, { rowLimit: 18, itemLimit: 12 }),
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Comparison failed.");
    }
  };

  return <section data-testid="mesh-topology-interpretations" style={{ borderTop: "1px solid #e2e8f0", marginTop: 10, paddingTop: 10, display: "grid", gap: 8, fontSize: 11 }}>
    <strong>Topology interpretations</strong>
    <div data-testid="mesh-topology-indexed-source">
      <strong>Indexed source</strong>
      {indexed ? counts(indexed) : <div>Source topology unavailable. Prepare full analysis data first.</div>}
      {document && <div>Document {document.identity.id} · revision {document.identity.revision} · resource {document.source.resource.checksum} · structural hash {document.identity.structuralHash}</div>}
    </div>
    <div data-testid="mesh-topology-suitability" style={{ display: "grid", gap: 3 }}>
      <strong>Suitability and separate checks</strong>
      <div>Closed-solid suitability: {closedSolidSuitability}</div>
      <div>Triangle validity: {trianglesValid == null ? "unknown" : trianglesValid ? "valid" : "invalid triangles or vertices"}</div>
      <div>Self-intersections: {selfIntersectionStatus}</div>
      <div>An open surface can be valid for surface work; closed-solid suitability is a separate requirement.</div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <label>Spatial-weld tolerance <input data-testid="mesh-topology-comparison-tolerance" type="number" min="0" step="any" value={toleranceText} onChange={(event) => setToleranceText(event.target.value)} style={{ width: 100, marginLeft: 5 }} /></label>
      <button data-testid="mesh-topology-request-comparison" type="button" disabled={!mesh || !document || !indexed} onClick={requestComparison}>Compare interpretations</button>
    </div>
    {error && <div role="alert">{error}</div>}
    <div data-testid="mesh-topology-spatial-weld">
      <strong>Spatial-weld interpretation</strong>
      {recorded ? <>
        {stale && <div>Historical interpretation: source or tolerance changed. Request a new comparison for the active mesh.</div>}
        <div>Method {recorded.comparison.method} · tolerance {recorded.comparison.tolerance}</div>
        <div>Source {recorded.sourceId} · revision {recorded.revision} · resource {recorded.checksum}</div>
        {counts(recorded.comparison.spatialWeld)}
        <div>Merged vertices {recorded.comparison.mergedVertexCount} · Collapsed faces {recorded.comparison.collapsedFaceCount}</div>
      </> : <div>Not computed. Request a comparison to interpret coincident positions.</div>}
    </div>
    <div>This comparison reads the source mesh; it does not weld, repair, or change its document.</div>
  </section>;
}
