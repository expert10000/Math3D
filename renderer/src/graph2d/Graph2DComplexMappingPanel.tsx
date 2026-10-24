import { useEffect, useRef, useState } from "react";
import { acceptGraph2DComplexContour, reviewGraph2DComplexContour, reviewGraph2DComplexPair,
  serializeComplexAnalysisDocument, type ComplexAnalysisDocument, type Graph2DComplexContourReview, type Graph2DDocument } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
import { reverifyComplexFieldSource } from "./reverifyComplexFieldSource";

const contourPath = (review: Graph2DComplexContourReview) => {
  const { domain, contours } = review.target, points = contours[0]?.points ?? [];
  const width = domain.re.max - domain.re.min, height = domain.im.max - domain.im.min;
  return points.map((point, index) => `${index ? "L" : "M"}${(point.re - domain.re.min) / width * 200},${200 - (point.im - domain.im.min) / height * 200}`).join(" ");
};

export function Graph2DComplexMappingPanel({ document, onPlace }: { document: Graph2DDocument;
  onPlace?: (target: ComplexAnalysisDocument) => void }) {
  const [sampleCount, setSampleCount] = useState("257"), [closure, setClosure] = useState<"auto" | "open" | "closed">("auto");
  const [chosenPairId, setChosenPairId] = useState("");
  const [review, setReview] = useState<Graph2DComplexContourReview | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const object = document.source.objects.find(item => item.id === document.selection.objectId);
  const paired = object?.kind === "explicit-cartesian" || object?.kind === "point-series";
  const scientific = object?.kind === "point-series";
  const pairCandidates = document.source.objects.filter(item => item.id !== object?.id &&
    (object?.kind === "explicit-cartesian" && item.kind === "explicit-cartesian" ||
      object?.kind === "point-series" && object.origin?.component === "real" &&
      item.kind === "point-series" && item.origin?.component === "imaginary" &&
      item.origin.sceneFingerprint === object.origin.sceneFingerprint &&
      item.origin.datasetId === object.origin.datasetId &&
      JSON.stringify(item.origin.slice) === JSON.stringify(object.origin.slice)));
  const pairId = pairCandidates.some(item => item.id === chosenPairId) ? chosenPairId : pairCandidates[0]?.id ?? "";
  const sourceKey = `${document.identity.id}|${document.identity.revision}|${document.identity.structuralHash}|${object?.id}|${pairId}|${sampleCount}|${closure}`;
  const latestKey = useRef(sourceKey);
  latestKey.current = sourceKey;
  useEffect(() => { setReview(null); setError(""); setBusy(false); }, [sourceKey]);
  const preview = async () => {
    const key = sourceKey;
    setBusy(true); setReview(null); setError("");
    try { if (!object) return;
      if (scientific) await reverifyComplexFieldSource(document, object.id, pairId);
      if (latestKey.current !== key) return;
      const next = object.kind === "parametric" ? reviewGraph2DComplexContour(document, object.id,
        { sampleCount: Number(sampleCount), closure }) :
        reviewGraph2DComplexPair(document, object.id, pairId,
          { sampleCount: object.kind === "point-series" ? object.table.rowCount : Number(sampleCount), closure }, pointTableStore);
      setReview(next); setError("");
    } catch (caught) { if (latestKey.current === key) { setReview(null); setError((caught as Error).message); } }
    finally { if (latestKey.current === key) setBusy(false); }
  };
  const acceptFresh = async () => {
    if (!review) return null;
    const key = sourceKey;
    if (review.target.provenance.graphSource?.scientificSource && review.source.pairedObjectId)
      await reverifyComplexFieldSource(document, review.source.objectId, review.source.pairedObjectId);
    if (latestKey.current !== key) throw new TypeError("Graph source changed during bundle verification; preview again.");
    return acceptGraph2DComplexContour(review, document, pointTableStore);
  };
  const download = async () => {
    setBusy(true);
    try { if (!review) return;
      const target = await acceptFresh();
      if (!target) return;
      const url = URL.createObjectURL(new Blob([serializeComplexAnalysisDocument(target)], { type: "application/json" }));
      const link = globalThis.document.createElement("a"); link.href = url;
      link.download = `complex-contour-${review.source.objectId}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setError("");
    } catch (caught) { setReview(null); setError((caught as Error).message); }
    finally { setBusy(false); }
  };
  const place = async () => {
    setBusy(true);
    try { if (!review || !onPlace) return;
      const target = await acceptFresh();
      if (target) onPlace(target);
      setError("");
    } catch (caught) { setReview(null); setError((caught as Error).message); }
    finally { setBusy(false); }
  };
  return <section aria-label="Graph to Complex Analysis" data-testid="graph2d-complex-mapping">
    <h3>Graph → Complex Analysis</h3>
    <p>{object?.kind === "parametric" ? "Map this parametric path as a sampled complex contour: real part = x(t), imaginary part = y(t)." :
      scientific ? "Pair the checked real and imaginary lines of one complex grid slice as contour coordinates." :
        "Pair two independent functions over their common x domain: real part = first y(x), imaginary part = second y(x)."} The target function stays identity z.</p>
    {paired && <label>Imaginary source <select aria-label="Complex imaginary source" value={pairId}
      onChange={event => setChosenPairId(event.target.value)}>
      {pairCandidates.length === 0 && <option value="">No compatible pair</option>}
      {pairCandidates.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>}
    {paired && pairCandidates.length === 0 && <p role="status">{scientific ?
      "Import the imaginary component from the same grid line and fixed coordinate first." :
      "Add a second explicit function to pair with this one."}</p>}
    <label>Contour samples <input aria-label="Complex contour samples" type="number" min="16" max="4097" step="1"
      value={scientific && object?.kind === "point-series" ? object.table.rowCount : sampleCount}
      disabled={scientific} onChange={event => setSampleCount(event.target.value)} /></label>
    {scientific && <p>Scientific line mappings use every checked row; their sample count is fixed by the grid.</p>}
    <label>Closure <select aria-label="Complex contour closure" value={closure}
      onChange={event => setClosure(event.target.value as typeof closure)}>
      <option value="auto">Detect matching endpoints</option><option value="open">Open contour</option>
      <option value="closed">Require matching endpoints</option></select></label>
    <button type="button" disabled={busy || !!paired && !pairId} onClick={() => void preview()}>Preview Complex contour</button>
    {busy && <p role="status">Rechecking the Graph source and scientific bundle…</p>}
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
      {review.source.pairedObjectId && <p>Real Graph object {review.source.objectId}; imaginary Graph object {review.source.pairedObjectId}.</p>}
      {review.target.provenance.graphSource?.scientificSource && <p>Verified complex grid: scene {review.target.provenance.graphSource.scientificSource.sceneId},
        dataset {review.target.provenance.graphSource.scientificSource.datasetId};
        {" "}{review.target.provenance.graphSource.scientificSource.fixedName} =
        {" "}{review.target.provenance.graphSource.scientificSource.fixedCoordinate}
        {" "}{review.target.provenance.graphSource.scientificSource.fixedUnit};
        {review.target.provenance.graphSource.scientificSource.plane && <>
          {" "}plane {review.target.provenance.graphSource.scientificSource.plane.fixedName} =
          {" "}{review.target.provenance.graphSource.scientificSource.plane.fixedCoordinate}
          {" "}{review.target.provenance.graphSource.scientificSource.plane.fixedUnit};</>}
        {" "}varying axis {review.target.provenance.graphSource.scientificSource.varyingAxis} (
        {review.target.provenance.graphSource.scientificSource.varyingName},
        {" "}{review.target.provenance.graphSource.scientificSource.varyingUnit}).
        Manifest <code>{review.target.provenance.graphSource.scientificSource.sceneFingerprint}</code>;
        real checksum <code>{review.target.provenance.graphSource.scientificSource.realResourceSha256}</code>;
        imaginary checksum <code>{review.target.provenance.graphSource.scientificSource.imaginaryResourceSha256}</code>.</p>}
      <ul>{review.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      <button type="button" disabled={busy} onClick={() => void download()}>Download Complex Analysis document</button>
      {onPlace && <button type="button" disabled={busy} onClick={() => void place()}>Open in Complex Analysis</button>}
      <p>Download and workspace placement both recheck the Graph source against this preview{scientific ? " and reopen the scientific bundle" : ""}. The target contains sampled contour geometry and identity function z.</p>
    </div>}
  </section>;
}
