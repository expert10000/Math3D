import { useEffect, useState } from "react";
import { graph2DClearConstructionActions, graph2DDerivedConstructionFromPoint, graph2DCurvatureConstructionFromPoint, graph2DOsculatingCircleConstructionFromPoint, graph2DPointConstructionFromProbe,
  GRAPH2D_MAX_CONSTRUCTIONS, type Graph2DConstructionAction, type Graph2DConstructionArtifact,
  type Graph2DDocument, type Graph2DPointOnCurveConstruction } from "@math3d/core";

function PointCard({ document, object, state, confidence, reason, onAction }: { document: Graph2DDocument;
  object: Graph2DPointOnCurveConstruction; state: string; confidence?: string; reason?: string | null;
  onAction: (action: Graph2DConstructionAction) => void }) {
  const [draft, setDraft] = useState(String(object.anchor.value));
  useEffect(() => setDraft(String(object.anchor.value)), [object.anchor.value]);
  const [error, setError] = useState("");
  const dependents = document.source.constructions?.objects.filter(item => item.inputs.some(input =>
    input.kind === "construction" && input.objectId === object.id)) ?? [];
  const sourceLabel = document.source.objects.find(item => item.id === object.inputs[0]?.objectId)?.label ?? object.inputs[0]?.objectId;
  const act = (action: Graph2DConstructionAction) => { try { onAction(action); setError(""); }
    catch (caught) { setError((caught as Error).message); } };
  return <li className="graph2d-construction-card" data-construction-id={object.id}>
    <strong>{object.label}</strong> <small>on {sourceLabel} · {object.anchor.parameter} = {object.anchor.value.toPrecision(6)} · {state}{confidence ? ` · ${confidence}` : ""}</small>
    {reason && <p>{reason}</p>}
    <small>Moving this saved point updates its dependent constructions; the source graph stays in place.</small>
    <form onSubmit={event => { event.preventDefault(); const value = Number(draft);
      if (!Number.isFinite(value) || draft.trim() === "") { setError("Enter a finite parameter."); return; }
      act({ type: "update", object: { ...object, anchor: { ...object.anchor, value } } }); }}>
      <label>{object.anchor.parameter} for {object.label}<input type="number" step="any" value={draft}
        onChange={event => setDraft(event.target.value)} /></label>
      <button type="submit">Move {object.label}</button>
    </form>
    <div className="graph2d-construction-actions">
      <button type="button" disabled={(document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS}
        onClick={() => act({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "tangent") })}>Add tangent</button>
      <button type="button" disabled={(document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS}
        onClick={() => act({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "normal") })}>Add normal</button>
      <button type="button" disabled={(document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS}
        onClick={() => act({ type: "create", object: graph2DCurvatureConstructionFromPoint(document, object.id) })}>Add curvature</button>
      <button type="button" disabled={(document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS}
        onClick={() => act({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(document, object.id) })}>Add osculating circle</button>
      <button type="button" disabled={dependents.length > 0} title={dependents.length ? "Remove dependent constructions first." : undefined}
        onClick={() => act({ type: "delete", objectId: object.id })}>Delete {object.label}</button>
    </div>{error && <p role="alert">{error}</p>}
  </li>;
}

export function Graph2DConstructionsPanel({ document, artifact, onAction, onBatchAction }: { document: Graph2DDocument;
  artifact: Graph2DConstructionArtifact | null; onAction?: (action: Graph2DConstructionAction) => void;
  onBatchAction?: (actions: readonly Graph2DConstructionAction[]) => void }) {
  const [error, setError] = useState("");
  const objects = document.source.constructions?.objects ?? [];
  const available = !!document.selection.probe && !!document.source.objects.find(item =>
    item.id === document.selection.probe?.objectId && ["explicit-cartesian", "parametric", "polar"].includes(item.kind));
  const act = (action: Graph2DConstructionAction) => { try { if (!onAction) throw new Error("Construction editing is unavailable.");
    onAction(action); setError(""); } catch (caught) { setError((caught as Error).message); } };
  const clear = () => { try { if (!onBatchAction) throw new Error("Construction editing is unavailable.");
    onBatchAction(graph2DClearConstructionActions(document)); setError(""); }
    catch (caught) { setError((caught as Error).message); } };
  return <section className="graph2d-constructions-panel" data-testid="graph2d-constructions" aria-label="Constructions">
    <h3>Constructions ({objects.length}/{GRAPH2D_MAX_CONSTRUCTIONS})</h3>
    <button type="button" disabled={!available || !artifact || !onAction || objects.length >= GRAPH2D_MAX_CONSTRUCTIONS}
      title={!available ? "Select a committed curve probe first." : !artifact ? "Wait for the graph to update." : undefined}
      onClick={() => act({ type: "create", object: graph2DPointConstructionFromProbe(document, `Point ${objects.filter(item => item.kind === "point-on-curve").length + 1}`) })}>
      Save probe as point</button>
    {objects.length > 0 && <button type="button" disabled={!onBatchAction} onClick={clear}>Clear all constructions</button>}
    {objects.length > 0 && <p role="status">{artifact ? artifact.truncated ? "Construction output limit reached." :
      `${artifact.objects.filter(item => item.state === "ready").length} ready · ${artifact.objects.filter(item => item.state === "unavailable").length} unavailable` : "Recomputing constructions…"}</p>}
    <ol>{objects.map(object => object.kind === "point-on-curve" ?
      <PointCard key={object.id} document={document} object={object}
        state={artifact?.objects.find(item => item.id === object.id)?.state ?? "pending"}
        confidence={artifact?.objects.find(item => item.id === object.id)?.confidence}
        reason={artifact?.objects.find(item => item.id === object.id)?.reason} onAction={act} /> :
      <li key={object.id} className="graph2d-construction-card" data-construction-id={object.id}>
        <strong>{object.label}</strong> <small>{object.kind} · {artifact?.objects.find(item => item.id === object.id)?.state ?? "pending"} · {artifact?.objects.find(item => item.id === object.id)?.confidence ?? "pending"}</small>
        {object.kind === "curvature" && artifact?.objects.find(item => item.id === object.id)?.measurement &&
          <p data-testid="graph2d-saved-curvature">κ = {artifact.objects.find(item => item.id === object.id)!.measurement!.value.toPrecision(8)} · {artifact.objects.find(item => item.id === object.id)!.measurement!.method} · {artifact.objects.find(item => item.id === object.id)!.measurement!.convention} · no certified error bound</p>}
        {object.kind === "osculating-circle" && artifact?.objects.find(item => item.id === object.id)?.circle &&
          <p data-testid="graph2d-saved-osculating-circle">Center ({artifact.objects.find(item => item.id === object.id)!.circle!.center.x.toPrecision(8)}, {artifact.objects.find(item => item.id === object.id)!.circle!.center.y.toPrecision(8)}) · radius {artifact.objects.find(item => item.id === object.id)!.circle!.radius.toPrecision(8)} · approximate · no certified error bound</p>}
        {object.anchor && "interval" in object.anchor && <small>Original x {object.anchor.seedX.toPrecision(7)} · match ±{object.anchor.matchRadius.toPrecision(3)} · scan [{object.anchor.interval.min.toPrecision(5)}, {object.anchor.interval.max.toPrecision(5)}] · {object.anchor.method} · residual {object.anchor.residual.toExponential(2)} · saved {object.anchor.confidence}</small>}
        {artifact?.objects.find(item => item.id === object.id)?.reason && <p>{artifact.objects.find(item => item.id === object.id)?.reason}</p>}
        <button type="button" onClick={() => act({ type: "delete", objectId: object.id })}>Delete {object.label}</button>
      </li>)}</ol>
    {error && <p role="alert">{error}</p>}
  </section>;
}
