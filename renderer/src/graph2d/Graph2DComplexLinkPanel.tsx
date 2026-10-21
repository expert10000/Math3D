import { useEffect, useState } from "react";
import { graph2DComplexContourSourceStatus, refreshGraph2DComplexContour,
  type ComplexAnalysisDocument, type Graph2DDocument } from "@math3d/core";

type RefreshReview = Readonly<{ sourceRevision: number; sourceHash: string;
  targetRevision: number; targetHash: string; proposal: ComplexAnalysisDocument }>;

export function Graph2DComplexLinkPanel({ target, source, onRefresh }: { target: ComplexAnalysisDocument;
  source: Graph2DDocument | null; onRefresh: (document: ComplexAnalysisDocument) => void }) {
  const link = target.provenance.graphSource;
  const status = graph2DComplexContourSourceStatus(target, source);
  const [review, setReview] = useState<RefreshReview | null>(null);
  const [error, setError] = useState("");
  const key = `${target.identity.id}|${target.identity.revision}|${target.identity.structuralHash}|${source?.identity.revision}|${source?.identity.structuralHash}`;
  useEffect(() => { setReview(null); setError(""); }, [key]);
  if (!link) return null;
  const preview = () => {
    try { if (!source) throw new TypeError("Open the linked Graph source before refreshing this contour.");
      const proposal = refreshGraph2DComplexContour(target, source);
      setReview({ sourceRevision: source.identity.revision, sourceHash: source.identity.structuralHash,
        targetRevision: target.identity.revision, targetHash: target.identity.structuralHash, proposal });
      setError("");
    } catch (caught) { setReview(null); setError((caught as Error).message); }
  };
  const apply = () => {
    try { if (!source || !review) return;
      if (source.identity.revision !== review.sourceRevision || source.identity.structuralHash !== review.sourceHash ||
          target.identity.revision !== review.targetRevision || target.identity.structuralHash !== review.targetHash)
        throw new TypeError("Source or target changed after refresh review; preview again.");
      const fresh = refreshGraph2DComplexContour(target, source);
      if (fresh.identity.structuralHash !== review.proposal.identity.structuralHash)
        throw new TypeError("Contour changed after refresh review; preview again.");
      onRefresh(fresh); setReview(null); setError("");
    } catch (caught) { setReview(null); setError((caught as Error).message); }
  };
  return <section aria-label="Linked Graph contour" data-testid="graph2d-complex-link">
    <strong>Linked Graph contour</strong>
    <p role="status">Source {status}. Graph {link.documentId}, object {link.objectId}, revision {link.revision}.
      {status === "target-edited" && " Local Complex edits prevent automatic refresh."}
      {status === "missing" && " Open the source Graph document to check or refresh the link."}</p>
    <p>{link.sampleCount} sampled points · closure {link.closure ?? "auto"} · target revision {target.identity.revision}.</p>
    {status === "changed" && <button type="button" onClick={preview}>Review contour refresh</button>}
    {error && <p role="alert">{error}</p>}
    {review && <div data-testid="graph2d-complex-refresh-review">
      <p>Graph revision {link.revision} → {review.sourceRevision}; Complex revision {target.identity.revision} → {review.proposal.identity.revision}.</p>
      <p>Source hash <code>{link.structuralHash}</code> → <code>{review.sourceHash}</code>.</p>
      <p>{target.contours[0]?.points.length ?? 0} → {review.proposal.contours[0]?.points.length ?? 0} points;
        real domain [{target.domain.re.min.toPrecision(5)}, {target.domain.re.max.toPrecision(5)}] →
        [{review.proposal.domain.re.min.toPrecision(5)}, {review.proposal.domain.re.max.toPrecision(5)}];
        imaginary domain [{target.domain.im.min.toPrecision(5)}, {target.domain.im.max.toPrecision(5)}] →
        [{review.proposal.domain.im.min.toPrecision(5)}, {review.proposal.domain.im.max.toPrecision(5)}].</p>
      <p>Applying this refresh starts a new Complex edit checkpoint. Export a Project snapshot first to keep the earlier version.</p>
      <button type="button" onClick={apply}>Apply reviewed contour refresh</button>
    </div>}
  </section>;
}
