import { useEffect, useState } from "react";
import { acceptGraph2DComplexContour, reviewGraph2DComplexContour,
  serializeComplexAnalysisDocument, type Graph2DComplexContourReview, type Graph2DDocument } from "@math3d/core";

const contourPath = (review: Graph2DComplexContourReview) => {
  const { domain, contours } = review.target, points = contours[0]?.points ?? [];
  const width = domain.re.max - domain.re.min, height = domain.im.max - domain.im.min;
  return points.map((point, index) => `${index ? "L" : "M"}${(point.re - domain.re.min) / width * 200},${200 - (point.im - domain.im.min) / height * 200}`).join(" ");
};

export function Graph2DComplexMappingPanel({ document }: { document: Graph2DDocument }) {
  const [sampleCount, setSampleCount] = useState("257"), [closure, setClosure] = useState<"auto" | "open" | "closed">("auto");
  const [review, setReview] = useState<Graph2DComplexContourReview | null>(null), [error, setError] = useState("");
  const object = document.source.objects.find(item => item.id === document.selection.objectId);
  const sourceKey = `${document.identity.id}|${document.identity.revision}|${document.identity.structuralHash}|${object?.id}`;
  useEffect(() => { setReview(null); setError(""); }, [sourceKey, sampleCount, closure]);
  const preview = () => {
    try { if (object?.kind !== "parametric") return;
      const next = reviewGraph2DComplexContour(document, object.id,
        { sampleCount: Number(sampleCount), closure });
      setReview(next); setError("");
    } catch (caught) { setReview(null); setError((caught as Error).message); }
  };
  const download = () => {
    try { if (!review) return;
      const target = acceptGraph2DComplexContour(review, document);
      const url = URL.createObjectURL(new Blob([serializeComplexAnalysisDocument(target)], { type: "application/json" }));
      const link = globalThis.document.createElement("a"); link.href = url;
      link.download = `complex-contour-${review.source.objectId}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setError("");
    } catch (caught) { setReview(null); setError((caught as Error).message); }
  };
  return <section aria-label="Graph to Complex Analysis" data-testid="graph2d-complex-mapping">
    <h3>Graph → Complex Analysis</h3>
    <p>Map this parametric path as a sampled complex contour: real part = x(t), imaginary part = y(t). The target function stays identity z.</p>
    <label>Contour samples <input aria-label="Complex contour samples" type="number" min="16" max="4097" step="1"
      value={sampleCount} onChange={event => setSampleCount(event.target.value)} /></label>
    <label>Closure <select aria-label="Complex contour closure" value={closure}
      onChange={event => setClosure(event.target.value as typeof closure)}>
      <option value="auto">Detect matching endpoints</option><option value="open">Open contour</option>
      <option value="closed">Require matching endpoints</option></select></label>
    <button type="button" onClick={preview}>Preview Complex contour</button>
    {error && <p role="alert">{error}</p>}
    {review && <div data-testid="graph2d-complex-mapping-review">
      <p role="status">Reviewed {review.target.contours[0]!.points.length} points · {review.target.contours[0]!.closed ? "closed" : "open"} contour.</p>
      <svg role="img" aria-label="Complex contour preview" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet"
        style={{ width: 200, height: 200, background: "#f6f9fc" }}>
        <path d={contourPath(review)} fill="none" stroke="#2563eb" strokeWidth="2" /></svg>
      <p>Endpoint gap {review.endpointGap.toPrecision(6)}; closure tolerance {review.closureTolerance.toPrecision(6)};
        largest sampled step {review.maximumSegmentLength.toPrecision(6)}.</p>
      <p>Real domain [{review.target.domain.re.min.toPrecision(6)}, {review.target.domain.re.max.toPrecision(6)}];
        imaginary domain [{review.target.domain.im.min.toPrecision(6)}, {review.target.domain.im.max.toPrecision(6)}].</p>
      <p>Source revision {review.source.revision} · <code>{review.source.structuralHash}</code></p>
      <ul>{review.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      <button type="button" onClick={download}>Download Complex Analysis document</button>
      <p>Rechecks the Graph source at download. The file is a versioned Complex Analysis document; live workspace placement and linked refresh UI are future work.</p>
    </div>}
  </section>;
}
