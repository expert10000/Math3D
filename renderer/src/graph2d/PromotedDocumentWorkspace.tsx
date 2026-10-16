import { useMemo, useState } from "react";
import { graph2DPromotionStatus, isGraph2DPromotionTargetEdited, compareGraph2DPromotionGenerations,
  replaceCurveDocumentSource, replaceSurfaceDocumentSource, evaluateGraph2DPromotionGeometry,
  type Graph2DAnyPromotion, type Graph2DDocument } from "@math3d/core";
import { PromotionGeometryView } from "./PromotionGeometryView";
import { GeometryViewer } from "../components/GeometryViewer";

function PromotedGeometryMainViewer({ promotion }: { promotion: Extract<Graph2DAnyPromotion["document"], { format: "math3d.geometry-document" }> }) {
  const [fitToken, setFitToken] = useState(1);
  const [resetToken, setResetToken] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const scene = promotion.source.geometry ?? { segments: [] };
  const bounds = useMemo(() => {
    const points = scene.segments?.flatMap((segment) => [segment.a, segment.b]) ?? [];
    if (!points.length) return { center: { x: 0, y: 0, z: 0 }, radius: 2 };
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const point of points) for (const axis of ["x", "y", "z"] as const) {
      min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
    }
    return { center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
      radius: Math.max(0.1, Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2) };
  }, [scene]);
  return <div data-testid="graph2d-geometry-main-viewer" style={{ flex: 1, minWidth: 260, minHeight: 320, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, flexWrap: "wrap" }}>
      <strong>Geometry viewer</strong>
      <button type="button" onClick={() => setFitToken((value) => value + 1)}>Fit geometry</button>
      <button type="button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>Grid</button>
      <button type="button" onClick={() => setResetToken((value) => value + 1)}>Reset view</button>
      <span>Orbit to inspect · profile lies in z=0</span>
    </div>
    <div style={{ flex: 1, minHeight: 280 }}><GeometryViewer scene={scene} showPlanes={showGrid}
      cameraFitCommand={{ token: fitToken, ...bounds, padding: 1.25 }} resetToken={resetToken} pickEnabled={false} /></div>
  </div>;
}

export function PromotedDocumentWorkspace({ promotion, source, onEdit, onLocateSource, onRegenerate, onClose }: {
  promotion: Graph2DAnyPromotion; source: Graph2DDocument;
  onEdit: (promotion: Graph2DAnyPromotion) => void; onLocateSource: () => void;
  onRegenerate: (mode: "replace" | "fork") => void; onClose: () => void;
}) {
  const [expression, setExpression] = useState(promotion.document.format === "math3d.geometry-document" ? "" : promotion.document.source.definition.expressions?.y ?? "");
  const [error, setError] = useState("");
  const comparison = compareGraph2DPromotionGenerations(promotion, source);
  const sourceAvailable = source.identity.id === promotion.trace.sourceDocumentId &&
    source.source.objects.some((object) => object.id === promotion.trace.sourceObjectId);
  const edit = () => {
    try {
      const current = promotion.document;
      if (current.format === "math3d.geometry-document") throw new TypeError("Edit Geometry segments in the Geometry workspace.");
      const nextSource = { ...current.source, definition: { ...current.source.definition,
        expressions: { ...current.source.definition.expressions, y: expression } } };
      const document = current.format === "math3d.curve-document" ?
        replaceCurveDocumentSource(current, nextSource as typeof current.source) :
        replaceSurfaceDocumentSource(current, nextSource as typeof current.source);
      evaluateGraph2DPromotionGeometry(document);
      const next = document.format === "math3d.curve-document" ? { ...promotion, document } : { ...promotion, document };
      onEdit(next); setError("");
    } catch (caught) { setError((caught as Error).message); }
  };
  return <section data-testid="promoted-document-workspace" style={{ display: "flex", flex: 1, minHeight: 0, flexWrap: "wrap" }}>
    <aside style={{ padding: 16, width: 300, overflow: "auto" }}>
      <h2>{promotion.document.format === "math3d.curve-document" ? "Curve" : promotion.document.format === "math3d.geometry-document" ? "Geometry" : "Surface"}: {promotion.document.metadata.title}</h2>
      <p data-testid="promoted-document-status">Source {graph2DPromotionStatus(promotion, source)} ·
        {isGraph2DPromotionTargetEdited(promotion) ? " target edited" : " target unchanged"}</p>
      <p>Captured source r{comparison.capturedRevision} · current r{comparison.currentRevision} · target r{promotion.document.identity.revision}</p>
      <code style={{ overflowWrap: "anywhere" }}>{promotion.document.identity.id}</code>
      {!sourceAvailable && <p role="status">The source graph object is unavailable. This target snapshot is preserved.</p>}
      <p><button type="button" disabled={!sourceAvailable} onClick={onLocateSource}>Locate graph source</button></p>
      {promotion.document.format === "math3d.geometry-document" ?
        <p>Sampled profile in the z=0 plane · {promotion.document.source.geometry?.segments?.length ?? 0} segments. The Graph expression and source generation are recorded in this Geometry document.</p> : <>
        <label>Profile y expression <input aria-label="Target y expression" value={expression} onChange={(event) => setExpression(event.target.value)} /></label>
        <button type="button" onClick={edit}>Apply target edit</button></>}
      <p><button type="button" disabled={!sourceAvailable || isGraph2DPromotionTargetEdited(promotion)} onClick={() => onRegenerate("replace")}>Regenerate target</button>
        <button type="button" disabled={!sourceAvailable} onClick={() => onRegenerate("fork")}>Fork target</button></p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onClose}>Return to gallery</button>
    </aside>
    {promotion.document.format === "math3d.geometry-document" ? <PromotedGeometryMainViewer promotion={promotion.document} /> :
      <div style={{ flex: 1, minWidth: 260, minHeight: 300 }}><PromotionGeometryView document={promotion.document} /></div>}
  </section>;
}
