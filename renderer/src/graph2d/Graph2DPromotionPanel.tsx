import { useState } from "react";
import { promoteGraph2DToCurve, revolveGraph2DProfile, extrudeGraph2DProfile,
  graph2DPromotionStatus, isGraph2DPromotionTargetEdited, evaluateGraph2DPromotionGeometry,
  type Graph2DDocument, type Graph2DAnyPromotion, type Graph2DExtrudeOptions } from "@math3d/core";
import { PromotionGeometryView } from "./PromotionGeometryView";

export function Graph2DPromotionPanel({ document, promotions, onCreate, onLocate, onRegenerate }: {
  document: Graph2DDocument; promotions: readonly Graph2DAnyPromotion[];
  onCreate: (promotion: Graph2DAnyPromotion) => void;
  onLocate: (id: string) => void;
  onRegenerate: (id: string, mode: "replace" | "fork") => void;
}) {
  const [operation, setOperation] = useState<"curve" | "revolve" | "extrude">("curve");
  const [axis, setAxis] = useState<"x" | "y">("x");
  const [orientation, setOrientation] = useState<"positive" | "negative">("positive");
  const [angleMin, setAngleMin] = useState("0"), [angleMax, setAngleMax] = useState(String(Math.PI * 2));
  const [direction, setDirection] = useState("0,0,1"), [length, setLength] = useState("3");
  const [caps, setCaps] = useState<Graph2DExtrudeOptions["caps"]>("none");
  const [preview, setPreview] = useState<Graph2DAnyPromotion | null>(null), [error, setError] = useState("");
  const source = document.source.objects.find((object) => object.id === document.selection.objectId);
  const allowed = source?.kind === "explicit-cartesian" || source?.kind === "parametric";
  const createPreview = () => {
    try {
      const id = source!.id;
      const next = operation === "curve" ? promoteGraph2DToCurve(document, id) : operation === "revolve" ?
        revolveGraph2DProfile(document, id, { axis, orientation, angleMin: Number(angleMin), angleMax: Number(angleMax) }) :
        extrudeGraph2DProfile(document, id, { direction: direction.split(",").map(Number) as [number, number, number], length: Number(length), caps });
      evaluateGraph2DPromotionGeometry(next.document);
      setPreview(next); setError("");
    } catch (caught) { setError((caught as Error).message); setPreview(null); }
  };
  const currentPreview = preview && preview.trace.sourceObjectId === source?.id &&
    preview.relation.sources[0]!.structuralHash === document.identity.structuralHash &&
    preview.relation.sources[0]!.revision === document.identity.revision ? preview : null;
  const update = (action: () => void) => { action(); setPreview(null); setError(""); };
  return <section aria-label="Graph promotions" data-testid="graph2d-promotions">
    <h3>Curve and Surface</h3>
    {allowed ? <>
      <label>Operation <select aria-label="Promotion operation" value={operation}
        onChange={(event) => update(() => setOperation(event.target.value as typeof operation))}>
        <option value="curve">Promote to Curve</option><option value="revolve">Revolve to Surface</option><option value="extrude">Extrude to Surface</option>
      </select></label>
      {operation === "revolve" && <>
        <label>Axis <select aria-label="Revolution axis" value={axis} onChange={(event) => update(() => setAxis(event.target.value as typeof axis))}>
          <option value="x">X</option><option value="y">Y</option></select></label>
        <label>Orientation <select aria-label="Revolution orientation" value={orientation} onChange={(event) => update(() => setOrientation(event.target.value as typeof orientation))}>
          <option value="positive">Positive</option><option value="negative">Negative</option></select></label>
        <label>Angle start (rad) <input aria-label="Revolution angle start" value={angleMin} onChange={(event) => update(() => setAngleMin(event.target.value))} /></label>
        <label>Angle end (rad) <input aria-label="Revolution angle end" value={angleMax} onChange={(event) => update(() => setAngleMax(event.target.value))} /></label>
      </>}
      {operation === "extrude" && <>
        <label>Direction <input aria-label="Extrusion direction" value={direction} onChange={(event) => update(() => setDirection(event.target.value))} /></label>
        <label>Length <input aria-label="Extrusion length" value={length} onChange={(event) => update(() => setLength(event.target.value))} /></label>
        <label>Caps <select aria-label="Extrusion caps" value={caps} onChange={(event) => update(() => setCaps(event.target.value as typeof caps))}>
          {(["none", "start", "end", "both"] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </>}
      <button type="button" onClick={createPreview}>Preview promotion</button>
      {currentPreview && <div><PromotionGeometryView document={currentPreview.document} />
        <p>{source.label} · {operation} · domain {source.domain.min} to {source.domain.max}</p>
        <button type="button" onClick={() => { onCreate(currentPreview); setPreview(null); }}>Create and open</button>
        <button type="button" onClick={() => setPreview(null)}>Cancel preview</button>
      </div>}
    </> : <p>Select an explicit or parametric graph to promote.</p>}
    {error && <p role="alert">{error}</p>}
    {promotions.filter((item) => item.trace.sourceObjectId === source?.id).map((item) => <div key={item.document.identity.id} data-testid="graph2d-promotion-record">
      <p>{item.document.metadata.title} · <span data-testid="promotion-source-status">{graph2DPromotionStatus(item, document)}</span>
        {isGraph2DPromotionTargetEdited(item) && " · target edited"}</p>
      <button type="button" onClick={() => onLocate(item.document.identity.id)}>Locate target</button>
      <button type="button" disabled={isGraph2DPromotionTargetEdited(item)} onClick={() => onRegenerate(item.document.identity.id, "replace")}>Regenerate target</button>
      <button type="button" onClick={() => onRegenerate(item.document.identity.id, "fork")}>Fork target</button>
    </div>)}
  </section>;
}
