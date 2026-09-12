import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BEZIER_CURVE,
  DEFAULT_BSPLINE_CURVE,
  DEFAULT_NURBS_QUARTER_ARC,
  RATIONAL_NURBS_CIRCLE,
  buildSplineCurve,
  cloneSplineFixture,
  constrainSplineJoin,
  createSplineHistory,
  currentSplineRevision,
  elevateBezierDegree,
  evaluateSpline,
  insertSplineKnot,
  moveSplineControlPoint,
  pushSplineHistory,
  redoSplineHistory,
  reduceBezierDegree,
  removeSplineKnot,
  setSplineKnot,
  setSplineWeight,
  splineConstructionEvidence,
  subdivideBezier,
  undoSplineHistory,
  type CanonicalSplineDefinition,
  type CurvePoint,
  type SplineContinuity,
  type SplineCurve,
  type SplineHistory,
  type SplineSelectionMode,
} from "@math3d/core";
import type { CurveViewerVec3 } from "./CurveViewer";

export type SplineVisualState = { controlPoints: CurveViewerVec3[]; constructionLevels: CurveViewerVec3[][]; knotPoints: CurveViewerVec3[]; weights: number[] };
export type SplineCurveEditorProps = {
  presetId: string;
  parameter: number;
  onChange: (definition: CanonicalSplineDefinition, curve: SplineCurve, visuals: SplineVisualState) => void;
};

const point3 = (point: CurvePoint): CurveViewerVec3 => ({ x: point.x, y: point.y, z: "z" in point ? point.z : 0 });
const fixtureFor = (presetId: string) => cloneSplineFixture(presetId === "bezierCubic" ? DEFAULT_BEZIER_CURVE : presetId === "bSplineDemo" ? DEFAULT_BSPLINE_CURVE : presetId === "nurbs-circle" ? RATIONAL_NURBS_CIRCLE : DEFAULT_NURBS_QUARTER_ARC);

export const SplineCurveEditor: React.FC<SplineCurveEditorProps> = ({ presetId, parameter, onChange }) => {
  const [history, setHistory] = useState<SplineHistory>(() => createSplineHistory(fixtureFor(presetId)));
  const [selectionMode, setSelectionMode] = useState<SplineSelectionMode>("control-point");
  const [selectedControl, setSelectedControl] = useState(0);
  const [selectedKnot, setSelectedKnot] = useState(0);
  const [editKnot, setEditKnot] = useState(0.5);
  const [continuity, setContinuity] = useState<SplineContinuity>("C1");
  const [editPoint, setEditPoint] = useState({ x: 0, y: 0, z: 0 });
  const [editWeight, setEditWeight] = useState(1);
  const [message, setMessage] = useState("Ready");
  const definition = currentSplineRevision(history);

  useEffect(() => { setHistory(createSplineHistory(fixtureFor(presetId))); setSelectedControl(0); setSelectedKnot(0); setEditKnot(0.5); setMessage("Ready"); }, [presetId]);
  useEffect(() => {
    const point = definition.controlPoints[Math.min(selectedControl, definition.controlPoints.length - 1)];
    setEditPoint(point3(point)); setEditWeight(definition.weights[Math.min(selectedControl, definition.weights.length - 1)] ?? 1);
  }, [definition, selectedControl]);

  const evidence = useMemo(() => {
    const t = definition.domain.tMin + Math.min(1, Math.max(0, parameter)) * (definition.domain.tMax - definition.domain.tMin);
    return splineConstructionEvidence(definition, t);
  }, [definition, parameter]);
  const visuals = useMemo<SplineVisualState>(() => ({
    controlPoints: definition.controlPoints.map(point3), weights: [...definition.weights],
    constructionLevels: evidence.levels.slice(1).map((level) => level.map(point3)),
    knotPoints: [...new Set(definition.knotVector)].filter((knot) => knot >= definition.domain.tMin && knot <= definition.domain.tMax).map((knot) => point3(evaluateSpline(definition, knot))),
  }), [definition, evidence.levels]);
  useEffect(() => onChange(definition, buildSplineCurve(definition), visuals), [definition, onChange, visuals]);

  const apply = (next: CanonicalSplineDefinition | null, success: string, failure = "Edit is not mathematically valid at the current tolerance.") => {
    if (!next) { setMessage(failure); return; }
    setHistory((current) => pushSplineHistory(current, next)); setMessage(success);
  };
  const run = (action: () => CanonicalSplineDefinition | null, success: string) => { try { apply(action(), success); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } };

  const movablePoint = definition.controlPoints[Math.min(selectedControl, definition.controlPoints.length - 1)];
  const editableKnots = definition.knotVector.map((knot, index) => ({ knot, index })).filter(({ index }) => index > definition.degree && index < definition.knotVector.length - definition.degree - 1);

  return <div data-testid="curve-spline-editor" style={{ display: "grid", gap: 8, fontSize: 11 }}>
    <div data-testid="curve-spline-contract" style={{ border: "1px solid #c4b5fd", background: "#f5f3ff", borderRadius: 7, padding: 7 }}><strong>{definition.kind} · degree {definition.degree}</strong><div>{definition.controlPoints.length} controls · {definition.knotVector.length} knots · revision {definition.revision}</div><div>{definition.closed ? "closed" : "open"} · {definition.periodic ? "periodic" : definition.clamped ? "clamped" : "unclamped"} · [{definition.domain.tMin}, {definition.domain.tMax}]</div></div>
    <label>Selection mode<select data-testid="curve-spline-selection-mode" value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as SplineSelectionMode)} style={{ width: "100%", marginTop: 4 }}>{["curve", "span", "control-point", "knot", "weight"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
    {(selectionMode === "control-point" || selectionMode === "weight") && <>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{definition.controlPoints.map((_, index) => <button data-testid={`curve-control-${index}`} key={index} type="button" aria-pressed={selectedControl === index} onClick={() => setSelectedControl(index)}>P{index}</button>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: definition.dimension === 3 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 4 }}>{(["x", "y", ...(definition.dimension === 3 ? ["z"] : [])]).map((axis) => <label key={axis}>{axis}<input aria-label={`Control ${axis}`} type="number" step={0.1} value={editPoint[axis as keyof typeof editPoint]} onChange={(event) => setEditPoint((current) => ({ ...current, [axis]: Number(event.target.value) }))} style={{ width: "100%" }} /></label>)}</div>
      <button data-testid="curve-spline-apply-control" type="button" onClick={() => run(() => moveSplineControlPoint(definition, selectedControl, definition.dimension === 2 ? { x: editPoint.x, y: editPoint.y } : editPoint), `Moved P${selectedControl}`)}>Apply control point</button>
      {definition.kind === "nurbs" && <label>Weight<input data-testid="curve-spline-weight" type="number" min={0.01} step={0.05} value={editWeight} onChange={(event) => setEditWeight(Number(event.target.value))} style={{ width: "100%", marginTop: 4 }} /><button data-testid="curve-spline-apply-weight" type="button" onClick={() => run(() => setSplineWeight(definition, selectedControl, editWeight), `Updated weight ${selectedControl}`)}>Apply weight</button></label>}
      <div style={{ color: "#64748b" }}>Selected P{selectedControl}: ({movablePoint.x}, {movablePoint.y}{"z" in movablePoint ? `, ${movablePoint.z}` : ""})</div>
    </>}
    {selectionMode === "knot" && <>{editableKnots.length ? <><select data-testid="curve-spline-knot-index" value={selectedKnot || editableKnots[0].index} onChange={(event) => { const index = Number(event.target.value); setSelectedKnot(index); setEditKnot(definition.knotVector[index]); }}>{editableKnots.map(({ knot, index }) => <option key={index} value={index}>U{index} = {knot}</option>)}</select><label>Knot value<input data-testid="curve-spline-knot-value" type="number" step={0.01} value={editKnot} onChange={(event) => setEditKnot(Number(event.target.value))} style={{ width: "100%" }} /></label><div style={{ display: "flex", gap: 4 }}><button type="button" onClick={() => run(() => insertSplineKnot(definition, 0.5 * (definition.domain.tMin + definition.domain.tMax)), "Inserted knot")}>Insert midpoint knot</button><button type="button" onClick={() => run(() => removeSplineKnot(definition, selectedKnot || editableKnots[0].index, 1e-5), "Removed knot")}>Remove selected knot</button><button type="button" onClick={() => run(() => setSplineKnot(definition, selectedKnot || editableKnots[0].index, editKnot), "Edited knot")}>Apply knot</button></div></> : <div>No editable interior knots.</div>}</>}
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {definition.kind === "bezier" && <><button data-testid="curve-spline-subdivide" type="button" onClick={() => run(() => subdivideBezier(definition, 0.5 * (definition.domain.tMin + definition.domain.tMax))[0], "Selected left subdivision branch")}>Subdivide</button><button data-testid="curve-spline-elevate" type="button" onClick={() => run(() => elevateBezierDegree(definition), "Elevated degree")}>Elevate degree</button><button type="button" onClick={() => run(() => reduceBezierDegree(definition), "Reduced degree")}>Reduce degree</button></>}
      <select aria-label="Join continuity" value={continuity} onChange={(event) => setContinuity(event.target.value as SplineContinuity)}>{["C0", "C1", "C2", "G1", "G2"].map((value) => <option key={value}>{value}</option>)}</select>
      <button data-testid="curve-spline-join" type="button" onClick={() => run(() => constrainSplineJoin(definition, { ...cloneSplineFixture(definition), id: `${definition.id}:joined` }, continuity), `Applied ${continuity} endpoint constraint`)}>Constrain join</button>
    </div>
    <div style={{ display: "flex", gap: 4 }}><button data-testid="curve-spline-undo" type="button" disabled={history.index === 0} onClick={() => { setHistory(undoSplineHistory(history)); setMessage("Undo"); }}>Undo</button><button data-testid="curve-spline-redo" type="button" disabled={history.index >= history.entries.length - 1} onClick={() => { setHistory(redoSplineHistory(history)); setMessage("Redo"); }}>Redo</button></div>
    <div data-testid="curve-spline-evidence">{definition.kind === "bezier" ? "De Casteljau" : "De Boor"} evidence · span {evidence.span} · {evidence.levels.length} levels</div>
    <div data-testid="curve-spline-message" style={{ color: message.includes("not") || message.includes("must") ? "#b91c1c" : "#166534" }}>{message}</div>
  </div>;
};
