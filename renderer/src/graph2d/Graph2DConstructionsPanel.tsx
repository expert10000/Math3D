import { useEffect, useState, type ReactNode } from "react";
import { graph2DConstructionHierarchy, graph2DClearConstructionActions, graph2DDerivedConstructionFromPoint, graph2DCurvatureConstructionFromPoint, graph2DOsculatingCircleConstructionFromPoint, graph2DPointConstructionFromProbe,
  graph2DPointDifferentialReadout, GRAPH2D_MAX_CONSTRUCTIONS, type Graph2DConstructionAction, type Graph2DConstructionArtifact,
  type Graph2DConstructionObject, type Graph2DResolvedConstruction,
  type Graph2DDocument, type Graph2DPointOnCurveConstruction } from "@math3d/core";

function PointCard({ document, object, resolved, onAction, onFitConstruction, children }: { document: Graph2DDocument;
  object: Graph2DPointOnCurveConstruction; resolved?: Graph2DResolvedConstruction;
  onAction: (action: Graph2DConstructionAction) => void; onFitConstruction?: (id: string) => void;
  children?: ReactNode }) {
  const [draft, setDraft] = useState(String(object.anchor.value));
  useEffect(() => setDraft(String(object.anchor.value)), [object.anchor.value]);
  const [error, setError] = useState("");
  const dependents = document.source.constructions?.objects.filter(item => item.inputs.some(input =>
    input.kind === "construction" && input.objectId === object.id)) ?? [];
  const sourceLabel = document.source.objects.find(item => item.id === object.inputs[0]?.objectId)?.label ?? object.inputs[0]?.objectId;
  const readout = graph2DPointDifferentialReadout(document, object, resolved);
  const full = (document.source.constructions?.objects.length ?? 0) >= GRAPH2D_MAX_CONSTRUCTIONS;
  const act = (action: Graph2DConstructionAction) => { try { onAction(action); setError(""); }
    catch (caught) { setError((caught as Error).message); } };
  return <li className="graph2d-construction-card" data-construction-id={object.id}>
    <header><strong>{object.label}</strong><small>on {sourceLabel} · {resolved?.state ?? "pending"} · {resolved?.confidence ?? "pending"}</small></header>
    {resolved?.reason && <p>{resolved.reason}</p>}
    {readout && <dl className="graph2d-construction-readout">
      <dt>Point</dt><dd>({readout.point.x.toPrecision(7)}, {readout.point.y.toPrecision(7)})</dd>
      <dt>Derivative</dt><dd>{readout.derivative ? `(${readout.derivative.x.toPrecision(7)}, ${readout.derivative.y.toPrecision(7)})` : "Unavailable"}</dd>
      <dt>Speed</dt><dd>{readout.speed?.toPrecision(7) ?? "Unavailable"}</dd>
      <dt>Curvature κ</dt><dd>{readout.curvature?.toPrecision(7) ?? "Unavailable"}</dd>
      <dt>Method</dt><dd>{readout.method} · approximate, no certified error bound</dd>
    </dl>}
    <form className="graph2d-construction-parameter" onSubmit={event => { event.preventDefault(); const value = Number(draft);
      if (!Number.isFinite(value) || draft.trim() === "") { setError("Enter a finite parameter."); return; }
      act({ type: "update", object: { ...object, anchor: { ...object.anchor, value } } }); }}>
      <label>{object.anchor.parameter} for {object.label}<input type="number" step="any" value={draft}
        onChange={event => setDraft(event.target.value)} /></label>
      <button type="submit" aria-label={`Move ${object.label}`}>Move</button>
    </form>
    <div className="graph2d-construction-actions">
      <button type="button" aria-label="Add tangent" disabled={full} onClick={() => act({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "tangent") })}>Tangent</button>
      <button type="button" aria-label="Add normal" disabled={full} onClick={() => act({ type: "create", object: graph2DDerivedConstructionFromPoint(document, object.id, "normal") })}>Normal</button>
      <button type="button" aria-label="Add curvature" disabled={full} onClick={() => act({ type: "create", object: graph2DCurvatureConstructionFromPoint(document, object.id) })}>Curvature</button>
      <button type="button" aria-label="Add osculating circle" disabled={full}
        onClick={() => act({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(document, object.id) })}>Osculating circle</button>
    </div>{error && <p role="alert">{error}</p>}
    <div className="graph2d-construction-footer">
      <button type="button" disabled={!onFitConstruction || resolved?.state !== "ready"} onClick={() => onFitConstruction?.(object.id)}>Fit point</button>
      <details><summary>More</summary><button type="button" disabled={dependents.length > 0} title={dependents.length ? "Remove dependent constructions first." : undefined}
        onClick={() => act({ type: "delete", objectId: object.id })}>Delete {object.label}</button>
        {dependents.length > 0 && <small>Remove dependent constructions before deleting this point.</small>}
      </details>
    </div>
    {children && <ol className="graph2d-construction-children">{children}</ol>}
  </li>;
}

function ConstructionCard({ document, object, resolved, onAction, onFitConstruction }: {
  document: Graph2DDocument; object: Graph2DConstructionObject; resolved?: Graph2DResolvedConstruction;
  onAction: (action: Graph2DConstructionAction) => void; onFitConstruction?: (id: string) => void }) {
  return <li className="graph2d-construction-card" data-construction-id={object.id}>
    <strong>{object.label}</strong> <small>{object.kind} · {resolved?.state ?? "pending"} · {resolved?.confidence ?? "pending"}</small>
    {object.inputs.length > 1 && <small>Sources: {object.inputs.map(input =>
      document.source.objects.find(source => source.id === input.objectId)?.label ?? input.objectId).join(" + ")}</small>}
    {object.kind === "curvature" && resolved?.measurement &&
      <p data-testid="graph2d-saved-curvature">κ = {resolved.measurement.value.toPrecision(8)} · {resolved.measurement.method} · {resolved.measurement.convention} · no certified error bound</p>}
    {object.kind === "osculating-circle" && resolved?.circle &&
      <p data-testid="graph2d-saved-osculating-circle">Center ({resolved.circle.center.x.toPrecision(8)}, {resolved.circle.center.y.toPrecision(8)}) · radius {resolved.circle.radius.toPrecision(8)} · approximate · no certified error bound. The dashed circle and center marker may overlap the source curve; use Fit to inspect them.</p>}
    {object.anchor && "interval" in object.anchor && <small>Original x {object.anchor.seedX.toPrecision(7)} · match ±{object.anchor.matchRadius.toPrecision(3)} · scan [{object.anchor.interval.min.toPrecision(5)}, {object.anchor.interval.max.toPrecision(5)}] · {object.anchor.method} · residual {object.anchor.residual.toExponential(2)} · saved {object.anchor.confidence}</small>}
    {resolved?.reason && <p>{resolved.reason}</p>}
    <div className="graph2d-construction-footer"><button type="button" disabled={!onFitConstruction || !resolved?.point}
      onClick={() => onFitConstruction?.(object.id)}>Fit construction</button>
      <details><summary>More</summary><button type="button" onClick={() => onAction({ type: "delete", objectId: object.id })}>Delete {object.label}</button></details></div>
  </li>;
}

export function Graph2DConstructionsPanel({ document, artifact, onAction, onBatchAction, onFitConstruction }: { document: Graph2DDocument;
  artifact: Graph2DConstructionArtifact | null; onAction?: (action: Graph2DConstructionAction) => void;
  onBatchAction?: (actions: readonly Graph2DConstructionAction[]) => void; onFitConstruction?: (id: string) => void }) {
  const [error, setError] = useState("");
  const objects = document.source.constructions?.objects ?? [];
  const hierarchy = graph2DConstructionHierarchy(document.source);
  const resolvedById = new Map(artifact?.objects.map(item => [item.id, item]) ?? []);
  const available = !!document.selection.probe && !!document.source.objects.find(item =>
    item.id === document.selection.probe?.objectId && ["explicit-cartesian", "parametric", "polar"].includes(item.kind));
  const act = (action: Graph2DConstructionAction) => { try { if (!onAction) throw new Error("Construction editing is unavailable.");
    onAction(action); setError(""); } catch (caught) { setError((caught as Error).message); } };
  const clear = () => { try { if (!onBatchAction) throw new Error("Construction editing is unavailable.");
    onBatchAction(graph2DClearConstructionActions(document)); setError(""); }
    catch (caught) { setError((caught as Error).message); } };
  return <section className="graph2d-constructions-panel" data-testid="graph2d-constructions" aria-label="Constructions">
    <h3>Constructions ({objects.length})</h3>
    <button type="button" disabled={!available || !artifact || !onAction || objects.length >= GRAPH2D_MAX_CONSTRUCTIONS}
      title={!available ? "Select a committed curve probe first." : !artifact ? "Wait for the graph to update." : undefined}
      onClick={() => act({ type: "create", object: graph2DPointConstructionFromProbe(document, `Point ${objects.filter(item => item.kind === "point-on-curve").length + 1}`) })}>
      Save probe as point</button>
    {objects.length > 0 && <details className="graph2d-construction-global-more"><summary>More</summary>
      <button type="button" disabled={!onBatchAction} onClick={clear}>Clear all constructions</button></details>}
    {objects.length > 0 && <p role="status">{artifact ? artifact.truncated ? "Construction output limit reached." :
      `${artifact.objects.filter(item => item.state === "ready").length} ready · ${artifact.objects.filter(item => item.state === "unavailable").length} unavailable` : "Recomputing constructions…"}</p>}
    {objects.length > 0 && <ol className="graph2d-construction-tree">{hierarchy.map(group => <li key={group.source.id} className="graph2d-construction-source">
      <strong>{group.source.label}</strong> <small>{group.source.kind} · {group.roots.length} direct construction{group.roots.length === 1 ? "" : "s"}</small>
      <ol>{group.roots.map(node => node.object.kind === "point-on-curve" ?
        <PointCard key={node.object.id} document={document} object={node.object}
          resolved={resolvedById.get(node.object.id)} onAction={act} onFitConstruction={onFitConstruction}>
          {node.children.map(child => <ConstructionCard key={child.object.id} document={document} object={child.object}
            resolved={resolvedById.get(child.object.id)} onAction={act} onFitConstruction={onFitConstruction} />)}
        </PointCard> : <ConstructionCard key={node.object.id} document={document} object={node.object}
          resolved={resolvedById.get(node.object.id)} onAction={act} onFitConstruction={onFitConstruction} />)}</ol>
    </li>)}</ol>}
    {objects.length >= GRAPH2D_MAX_CONSTRUCTIONS && <p role="status">Current safety budget: {GRAPH2D_MAX_CONSTRUCTIONS} constructions. Remove one to add another.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
