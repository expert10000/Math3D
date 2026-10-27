import { useEffect, useRef, useState } from "react";
import { graph2DComplexContourSourceStatus, refreshGraph2DComplexContour,
  type ComplexAnalysisDocument, type Graph2DDocument } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
import { reverifyComplexFieldSource } from "./reverifyComplexFieldSource";

type RefreshReview = Readonly<{ sourceRevision: number; sourceHash: string;
  targetRevision: number; targetHash: string; proposal: ComplexAnalysisDocument }>;

export function Graph2DComplexLinkPanel({ target, source, onRefresh }: { target: ComplexAnalysisDocument;
  source: Graph2DDocument | null; onRefresh: (document: ComplexAnalysisDocument) => void }) {
  const link = target.provenance.graphSource;
  const status = graph2DComplexContourSourceStatus(target, source, pointTableStore);
  const [review, setReview] = useState<RefreshReview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [bundleStatus, setBundleStatus] = useState<"unchecked" | "verified">("unchecked");
  const key = `${target.identity.id}|${target.identity.revision}|${target.identity.structuralHash}|${source?.identity.revision}|${source?.identity.structuralHash}`;
  const latestKey = useRef(key);
  latestKey.current = key;
  useEffect(() => { setReview(null); setError(""); setBusy(false); setBundleStatus("unchecked"); }, [key]);
  if (!link) return null;
  const checkBundle = async () => {
    if (!source || !link.scientificSource || !link.pairedObjectId) return;
    await reverifyComplexFieldSource(source, link.objectId, link.pairedObjectId);
  };
  const preview = async () => {
    const started = key;
    setBusy(true); setBundleStatus("unchecked");
    try { if (!source) throw new TypeError("Open the linked Graph source before refreshing this contour.");
      await checkBundle();
      if (latestKey.current !== started) return;
      const proposal = refreshGraph2DComplexContour(target, source, undefined, pointTableStore);
      setReview({ sourceRevision: source.identity.revision, sourceHash: source.identity.structuralHash,
        targetRevision: target.identity.revision, targetHash: target.identity.structuralHash, proposal });
      setError(""); if (link.scientificSource) setBundleStatus("verified");
    } catch (caught) { if (latestKey.current === started) { setReview(null); setError((caught as Error).message); } }
    finally { if (latestKey.current === started) setBusy(false); }
  };
  const verify = async () => {
    const started = key;
    setBusy(true); setBundleStatus("unchecked"); setError("");
    try { await checkBundle(); if (latestKey.current === started) setBundleStatus("verified"); }
    catch (caught) { if (latestKey.current === started) setError((caught as Error).message); }
    finally { if (latestKey.current === started) setBusy(false); }
  };
  const apply = async () => {
    const started = key;
    setBusy(true);
    try { if (!source || !review) return;
      await checkBundle();
      if (latestKey.current !== started) throw new TypeError("Source or target changed during bundle verification; preview again.");
      if (source.identity.revision !== review.sourceRevision || source.identity.structuralHash !== review.sourceHash ||
          target.identity.revision !== review.targetRevision || target.identity.structuralHash !== review.targetHash)
        throw new TypeError("Source or target changed after refresh review; preview again.");
      const fresh = refreshGraph2DComplexContour(target, source, undefined, pointTableStore);
      if (fresh.identity.structuralHash !== review.proposal.identity.structuralHash)
        throw new TypeError("Contour changed after refresh review; preview again.");
      onRefresh(fresh); setReview(null); setError("");
    } catch (caught) { if (latestKey.current === started) { setReview(null); setBundleStatus("unchecked"); setError((caught as Error).message); } }
    finally { if (latestKey.current === started) setBusy(false); }
  };
  return <section aria-label="Linked Graph contour" data-testid="graph2d-complex-link">
    <strong>Linked Graph contour</strong>
    <p role="status">Source {status}. Graph {link.documentId},
      {link.pairedObjectId ? ` real object ${link.objectId}, imaginary object ${link.pairedObjectId}` : ` object ${link.objectId}`},
      revision {link.revision}.
      {status === "target-edited" && " Local Complex edits prevent automatic refresh."}
      {status === "missing" && " Open the source Graph document to check or refresh the link."}</p>
    <p>{link.sampleCount} sampled points · closure {link.closure ?? "auto"} · target revision {target.identity.revision}.</p>
    {link.scientificSource && <p>Complex grid {link.scientificSource.sceneId}/{link.scientificSource.datasetId};
      {" "}{link.scientificSource.fixedName} = {link.scientificSource.fixedCoordinate} {link.scientificSource.fixedUnit};
      {link.scientificSource.plane && <> plane {link.scientificSource.plane.fixedName} =
        {" "}{link.scientificSource.plane.fixedCoordinate} {link.scientificSource.plane.fixedUnit};</>}
      {" "}axis {link.scientificSource.varyingAxis} ({link.scientificSource.varyingName}, {link.scientificSource.varyingUnit}).
      Manifest <code>{link.scientificSource.sceneFingerprint}</code>;
      component checksums <code>{link.scientificSource.realResourceSha256}</code> and
      {" "}<code>{link.scientificSource.imaginaryResourceSha256}</code>.</p>}
    {link.scientificSource && <>
      <p>Original bundle: {bundleStatus === "verified" ? "verified in this session" : "not checked in this session"}.</p>
      <button type="button" disabled={busy || !source} onClick={() => void verify()}>Verify original bundle</button>
    </>}
    {status === "changed" && <button type="button" disabled={busy} onClick={() => void preview()}>Review contour refresh</button>}
    {busy && <p>Checking linked source…</p>}
    {error && <p role="alert">{error}</p>}
    {review && <div data-testid="graph2d-complex-refresh-review">
      <p>Graph revision {link.revision} → {review.sourceRevision}; Complex revision {target.identity.revision} → {review.proposal.identity.revision}.</p>
      <p>Source hash <code>{link.structuralHash}</code> → <code>{review.sourceHash}</code>.</p>
      <p>{target.contours[0]?.points.length ?? 0} → {review.proposal.contours[0]?.points.length ?? 0} points;
        real domain [{target.domain.re.min.toPrecision(5)}, {target.domain.re.max.toPrecision(5)}] →
        [{review.proposal.domain.re.min.toPrecision(5)}, {review.proposal.domain.re.max.toPrecision(5)}];
        imaginary domain [{target.domain.im.min.toPrecision(5)}, {target.domain.im.max.toPrecision(5)}] →
        [{review.proposal.domain.im.min.toPrecision(5)}, {review.proposal.domain.im.max.toPrecision(5)}].</p>
      {link.scientificSource && review.proposal.provenance.graphSource?.scientificSource && <p>
        Scientific source: scene {link.scientificSource.sceneId}/{link.scientificSource.datasetId} →
        {" "}{review.proposal.provenance.graphSource.scientificSource.sceneId}/{review.proposal.provenance.graphSource.scientificSource.datasetId};
        {" "}{link.scientificSource.fixedName} = {link.scientificSource.fixedCoordinate} {link.scientificSource.fixedUnit} →
        {" "}{review.proposal.provenance.graphSource.scientificSource.fixedName} =
        {" "}{review.proposal.provenance.graphSource.scientificSource.fixedCoordinate}
        {" "}{review.proposal.provenance.graphSource.scientificSource.fixedUnit};
        {" "}manifest <code>{link.scientificSource.sceneFingerprint}</code> →
        {" "}<code>{review.proposal.provenance.graphSource.scientificSource.sceneFingerprint}</code>.
      </p>}
      <p>Applying this refresh starts a new Complex edit checkpoint. Export a Project snapshot first to keep the earlier version.</p>
      <button type="button" disabled={busy} onClick={() => void apply()}>Apply reviewed contour refresh</button>
    </div>}
  </section>;
}
