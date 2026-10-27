import { useRef, useState } from "react";
import { scientificFieldGraphResultState, type Graph2DAuthoringAction,
  type Graph2DDocument, type Graph2DPointSeriesObject,
  type ScientificFieldDocument } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
import { createSavedScientificFieldRefreshAction,
  reverifySavedScientificFieldGraphResult,
  type VerifiedSavedFieldGraphResult } from "./reverifySavedScientificFieldGraphResult";

type SourceStatus = "current" | "changed" | "missing" | "error" | undefined;

export function ScientificFieldGraphResultControls({ graph, object, fields, sourceStatus,
  onCommit, onVerificationStatus }: {
  graph: Graph2DDocument; object: Graph2DPointSeriesObject;
  fields: readonly ScientificFieldDocument[]; sourceStatus: SourceStatus;
  onCommit?: (action: Graph2DAuthoringAction) => void;
  onVerificationStatus?: (status: "current" | "changed" | "missing") => void;
}) {
  const latest = useRef({ graph, object, fields, onCommit, onVerificationStatus });
  latest.current = { graph, object, fields, onCommit, onVerificationStatus };
  const [review, setReview] = useState<VerifiedSavedFieldGraphResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ id: string; message: string } | null>(null);
  const saved = fields.find(item => item.identity.id === object.origin?.fieldDocument?.id);
  const active = review?.selectedId === object.id &&
    review.graphHash === graph.identity.structuralHash &&
    review.fieldRevision === saved?.identity.revision &&
    review.fieldHash === saved?.identity.structuralHash ? review : null;
  const lineage = object.origin ? scientificFieldGraphResultState(object.origin, fields) : "unbound";
  const status = busy ? "Reverifying saved Graph rows…" : active ?
    active.matchesStored && lineage === "current" ?
      "Graph rows verified against the saved source on this opening." :
      active.rowsMatch ? "Samples match; refresh the saved field revision and provenance." :
      "Saved Graph rows or provenance differ. Refresh from the verified source." :
    outcome?.id === object.id ? outcome.message :
    lineage === "stale" || sourceStatus === "changed" || sourceStatus === "missing" ||
      sourceStatus === "error" ?
      "Stale — saved field source or revision changed. Reverify before refresh." :
      "Saved rows; reverify against the source after Project reopen.";

  const checkCurrent = (result: VerifiedSavedFieldGraphResult) => {
    const current = latest.current;
    const field = current.fields.find(item => item.identity.id === result.fieldId);
    if (current.object.id !== result.selectedId ||
        current.graph.identity.structuralHash !== result.graphHash ||
        field?.identity.revision !== result.fieldRevision ||
        field.identity.structuralHash !== result.fieldHash)
      throw new TypeError("Graph or saved field changed during verification. Reverify the line.");
    return current;
  };
  const report = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    setReview(null); setError(message); setOutcome(null);
    if (/saved source|component|checksum|manifest|quantity|bundle|not found|ENOENT/i.test(message))
      latest.current.onVerificationStatus?.(/missing|not found|ENOENT/i.test(message) ? "missing" : "changed");
  };
  const reverify = async () => {
    if (busy) return;
    const snapshot = latest.current;
    setBusy(true); setReview(null); setError(""); setOutcome(null);
    try {
      const result = await reverifySavedScientificFieldGraphResult(snapshot.graph,
        snapshot.object.id, snapshot.fields, pointTableStore);
      checkCurrent(result);
      setReview(result);
      latest.current.onVerificationStatus?.("current");
    } catch (cause) { report(cause); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    if (busy || !active || !onCommit || active.matchesStored && lineage === "current") return;
    setBusy(true); setError(""); setOutcome(null);
    try {
      const snapshot = checkCurrent(active);
      const fresh = await reverifySavedScientificFieldGraphResult(snapshot.graph,
        snapshot.object.id, snapshot.fields, pointTableStore);
      const current = checkCurrent(fresh);
      if (fresh.verifiedHash !== active.verifiedHash ||
          fresh.sourceHash !== active.sourceHash ||
          fresh.fieldRevision !== active.fieldRevision || fresh.fieldHash !== active.fieldHash)
        throw new TypeError("Source changed since review. Reverify the line before refreshing.");
      const action = createSavedScientificFieldRefreshAction(fresh, current.graph, pointTableStore);
      current.onCommit?.(action);
      setReview(null);
      setOutcome({ id: fresh.selectedId, message: "Graph rows refreshed from the verified source." });
      current.onVerificationStatus?.("current");
    } catch (cause) { report(cause); }
    finally { setBusy(false); }
  };
  return <div data-testid="graph2d-saved-field-result-controls">
    <span role="status">{status}</span>
    <div><button type="button" data-testid="graph2d-reverify-saved-field-line"
      disabled={busy} onClick={() => void reverify()}>Reverify Graph line</button>{" "}
      <button type="button" data-testid="graph2d-refresh-saved-field-line"
        disabled={busy || !active || !onCommit || active.matchesStored && lineage === "current"}
        onClick={() => void refresh()}>Refresh from source</button></div>
    {error && <span role="alert">{error}</span>}
  </div>;
}
