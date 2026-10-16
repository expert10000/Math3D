import { useState } from "react";
import { graph2DPromotionStatus, isGraph2DPromotionTargetEdited, compareGraph2DPromotionGenerations,
  replaceCurveDocumentSource, replaceSurfaceDocumentSource, evaluateGraph2DPromotionGeometry,
  type Graph2DAnyPromotion, type Graph2DDocument } from "@math3d/core";
import { PromotionGeometryView } from "./PromotionGeometryView";

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
    <div style={{ flex: 1, minWidth: 260, minHeight: 300 }}><PromotionGeometryView document={promotion.document} /></div>
  </section>;
}
