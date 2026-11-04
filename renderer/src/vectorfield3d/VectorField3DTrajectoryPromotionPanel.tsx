import { useState } from "react";
import { prepareVectorField3DTrajectorySeeds, projectTrajectoryCurveStatus,
  promoteVectorField3DTrajectory, type Math3DProject, type ScientificSelection,
  type TrajectoryCurvePromotion, type TrajectorySeedRecipe,
  type VectorField3DDocument } from "@math3d/core";

const parsePoint = (text: string): [number, number, number] => {
  const values = text.split(/[\s,]+/).map(Number);
  if (values.length !== 3 || values.some(value => !Number.isFinite(value)))
    throw new TypeError("Enter finite x, y, z coordinates.");
  return values as [number, number, number];
};

export function VectorField3DTrajectoryPromotionPanel({ document, project, onSaveSeeds,
  onPromoteCurve }: { document: VectorField3DDocument; project?: Math3DProject | null;
  onSaveSeeds?: (document: VectorField3DDocument, selection: ScientificSelection) => void;
  onPromoteCurve?: (promotion: TrajectoryCurvePromotion) => void }) {
  const center = document.source.axes.map(axis => (axis.min + axis.max) / 2) as [number, number, number];
  const span = document.source.axes.map(axis => axis.max - axis.min);
  const [kind, setKind] = useState<TrajectorySeedRecipe["kind"]>("point-set");
  const [points, setPoints] = useState("0, 0, 0");
  const [count, setCount] = useState(5);
  const [axis, setAxis] = useState<0 | 1 | 2>(2);
  const [radius, setRadius] = useState(1);
  const [seedIndex, setSeedIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selections = project?.workspace.scientificSelections?.filter(item =>
    item.identity.kind === "authored" && item.geometry.kind === "trajectory-seed-recipe" &&
    item.source?.kind === "document" && item.source.documentId === document.identity.id) ?? [];
  const selected = selections.find(item => item.identity.kind === "authored" &&
    item.identity.id === selectedId) ?? null;
  const curves = project?.workspace.entries.filter(item => item.module === "curve" &&
    item.checkpoint.format === "math3d.curve-document" &&
    item.checkpoint.source.definition.familyId === "vector3d.trajectory" &&
    item.checkpoint.source.definition.sourceIds?.[0] === document.identity.id) ?? [];
  const makeRecipe = (): TrajectorySeedRecipe => {
    if (kind === "point-set") return { kind, points: points.trim().split(/\r?\n/)
      .filter(Boolean).map(parsePoint) };
    if (kind === "line") return { kind, start: [center[0] - span[0] / 4, center[1], center[2]],
      end: [center[0] + span[0] / 4, center[1], center[2]], count };
    if (kind === "ring") return { kind, center, normalAxis: axis, radius, count };
    const tangent = [0, 1, 2].filter(index => index !== axis);
    return { kind, normalAxis: axis, coordinate: center[axis],
      bounds: tangent.map(index => [center[index]! - span[index]! / 4,
        center[index]! + span[index]! / 4]) as unknown as
        [readonly [number, number], readonly [number, number]],
      counts: [Math.max(2, Math.min(5, count)), Math.max(2, Math.min(5, count))] };
  };
  const save = () => { try {
    if (!project || !onSaveSeeds) throw new TypeError("Open a saved Project first.");
    const prepared = prepareVectorField3DTrajectorySeeds(document, makeRecipe(), crypto.randomUUID());
    onSaveSeeds(prepared.document, prepared.selection);
    if (prepared.selection.identity.kind === "authored") setSelectedId(prepared.selection.identity.id);
    setSeedIndex(0); setError("");
    setMessage("Seed recipe and revised source saved in Project. Select a seed to promote its trajectory.");
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  const promote = () => { try {
    if (!selected || !onPromoteCurve) throw new TypeError("Save a seed recipe first.");
    const promotion = promoteVectorField3DTrajectory(document, selected, seedIndex, direction);
    onPromoteCurve(promotion); setError("");
    setMessage(`Curve saved; ${promotion.stopReason}; ${promotion.curve.source.definition.pointCount} points; ${
      promotion.curve.source.definition.settings?.solverMode}.`);
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  return <section aria-label="Trajectory seed recipes and Curve promotion" data-testid="gf13-trajectory-promotion">
    <h4>Trajectory seeds and Curve promotion</h4>
    <label>Seed recipe <select value={kind} onChange={event =>
      setKind(event.target.value as typeof kind)}>
      <option value="point-set">Point set</option><option value="line">Line</option>
      <option value="ring">Ring</option><option value="plane">Plane</option>
    </select></label>
    {kind === "point-set" && <label>Physical points (x, y, z; one per line)
      <textarea value={points} onChange={event => setPoints(event.target.value)} rows={3} /></label>}
    {kind !== "point-set" && <label>Count per pattern axis <input type="number" min={2} max={32}
      value={count} onChange={event => setCount(Number(event.target.value))} /></label>}
    {(kind === "ring" || kind === "plane") && <label>Normal axis <select value={axis}
      onChange={event => setAxis(Number(event.target.value) as 0 | 1 | 2)}>
      <option value={0}>x</option><option value={1}>y</option><option value={2}>z</option>
    </select></label>}
    {kind === "ring" && <label>Radius ({document.source.axes[0].unit})
      <input type="number" min={0} value={radius} onChange={event =>
        setRadius(Number(event.target.value))} /></label>}
    <button type="button" disabled={!project || !onSaveSeeds} onClick={save}>Save seed recipe</button>
    {selections.map(item => { const id = item.identity.kind === "authored" ? item.identity.id : "";
      return <button type="button" key={id} data-selection-id={id}
        aria-pressed={selectedId === id} onClick={() => { setSelectedId(id); setSeedIndex(0); }}>
        Use {item.geometry.kind === "trajectory-seed-recipe" ? item.geometry.recipe.kind : "recipe"}</button>;
    })}
    <label>Seed index <input type="number" min={0} max={Math.max(0, document.source.seeds.length - 1)}
      value={seedIndex} onChange={event => setSeedIndex(Number(event.target.value))} /></label>
    <label>Direction <select value={direction} onChange={event =>
      setDirection(event.target.value as typeof direction)}>
      <option value="forward">Forward</option><option value="backward">Backward</option>
    </select></label>
    <button type="button" disabled={!selected || !onPromoteCurve} onClick={promote}>Promote trajectory to Curve</button>
    {curves.map(item => { if (item.checkpoint.format !== "math3d.curve-document") return null;
      const status = projectTrajectoryCurveStatus(project!, item.checkpoint, document);
      return <p role="status" key={item.expected.id} data-testid="gf13-saved-curve">
        Curve {item.checkpoint.metadata.title}: {status.status}; {status.reason ??
          `${item.checkpoint.source.definition.settings?.stopReason}; ${item.checkpoint.source.domain.parameter} in ${item.checkpoint.source.units.parameter}`}
      </p>;
    })}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
