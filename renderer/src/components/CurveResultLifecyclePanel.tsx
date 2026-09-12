import React, { useMemo, useState } from "react";
import type { CanonicalCurveDefinition } from "../curveAnalysis/contracts";
import type { CurveAnalysisWorkspaceDocument } from "../curveAnalysis/persistence";
import type { CurveAnalysisResultStore } from "../curveAnalysis/infrastructure";
import {
  CURVE_ANALYSIS_PRESETS,
  applyCurveAnalysisPreset,
  beginCurveAnalysisPreset,
  compareCurveResultCards,
  curveResultToCsv,
  curveResultToJson,
  curveResultToSvg,
  deriveCurveResultCards,
  removeCurveResult,
  saveCurveResultReference,
  setCurveComparisonSelection,
  updateCurveResultLayer,
  type CurveAnalysisPresetId,
  type CurveResultCard,
  type CurveResultLifecycleState,
} from "../curveAnalysis/resultLifecycle";

export type CurveResultLifecyclePanelProps = {
  definition: CanonicalCurveDefinition;
  points: readonly { x: number; y: number; z: number }[];
  store: CurveAnalysisResultStore;
  lifecycle: CurveResultLifecycleState;
  workspace: CurveAnalysisWorkspaceDocument;
  onStoreChange: (store: CurveAnalysisResultStore) => void;
  onLifecycleChange: (state: CurveResultLifecycleState) => void;
  onWorkspaceChange: (workspace: CurveAnalysisWorkspaceDocument) => void;
  onPresetApplied?: (presetId: CurveAnalysisPresetId) => void;
  onSelectResult?: (card: CurveResultCard) => void;
  onFrameResult?: (card: CurveResultCard) => void;
};

const download = (name: string, contents: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
};

export const CurveResultLifecyclePanel: React.FC<CurveResultLifecyclePanelProps> = ({ definition, points, store, lifecycle, workspace, onStoreChange, onLifecycleChange, onWorkspaceChange, onPresetApplied, onSelectResult, onFrameResult }) => {
  const [presetId, setPresetId] = useState<CurveAnalysisPresetId>("curvature-lab");
  const cards = useMemo(() => deriveCurveResultCards(store, definition, lifecycle), [definition, lifecycle, store]);
  const compared = lifecycle.compareKeys.map((key) => cards.find((card) => card.resultKey === key)).filter((card): card is NonNullable<typeof card> => !!card);
  const comparison = compared.length === 2 ? compareCurveResultCards(compared[0], compared[1]) : null;
  const apply = () => {
    const begun = beginCurveAnalysisPreset(lifecycle, definition, presetId);
    const applied = applyCurveAnalysisPreset({ state: begun, store, definition, points, token: begun.activePreset!.token });
    onLifecycleChange(applied.state); onStoreChange(applied.store); if (applied.accepted) onPresetApplied?.(presetId);
  };
  const changeLayer = (key: string, action: Parameters<typeof updateCurveResultLayer>[2]) => onLifecycleChange(updateCurveResultLayer(lifecycle, key, action));
  return <section data-testid="curve-result-lifecycle" style={{ borderTop: "1px solid #d6deea", paddingTop: 8, display: "grid", gap: 7 }}>
    <div><strong>Analysis-layer presets</strong><div style={{ color: "#64748b", fontSize: 10 }}>Source presets choose the curve. These presets orchestrate result layers for the current revision.</div></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 5 }}><select data-testid="curve-analysis-preset" value={presetId} onChange={(event) => setPresetId(event.target.value as CurveAnalysisPresetId)}>{CURVE_ANALYSIS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select><button data-testid="curve-apply-analysis-preset" type="button" onClick={apply}>Apply</button></div>
    {lifecycle.activePreset && <div data-testid="curve-active-analysis-preset" style={{ color: lifecycle.activePreset.state === "stale" ? "#9a3412" : "#166534", fontSize: 10 }}>Preset {CURVE_ANALYSIS_PRESETS.find((preset) => preset.id === lifecycle.activePreset?.presetId)?.label} · {lifecycle.activePreset.state} · Curve r{lifecycle.activePreset.curveRevision}</div>}
    <div data-testid="curve-result-cards" style={{ display: "grid", gap: 6 }}>
      {cards.length === 0 && <div style={{ color: "#64748b" }}>Apply an analysis preset to create scientific result cards.</div>}
      {cards.map((card) => <article key={card.resultKey} data-testid={`curve-result-card-${card.variant}`} style={{ border: card.layer.selected ? "2px solid #2563eb" : "1px solid #cbd5e1", borderRadius: 7, padding: 7, background: card.state === "stale" ? "#fff7ed" : "#fff", display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 5 }}><strong>{card.label}</strong><span>{card.state}</span></div>
        <div style={{ fontSize: 10 }}>{card.method} · {card.valueUnit} · {card.backend} · {card.computeTimeMs ?? "—"} ms</div>
        <div style={{ fontSize: 10 }}>Curve {card.identity.curveId} r{card.identity.curveRevision} · result v{card.resultVersion} · dependencies {card.dependencies.length}</div>
        {card.statistics && <div style={{ fontSize: 10 }}>valid {card.statistics.validCount}/{card.statistics.sampleCount} · min {card.statistics.minimum?.toPrecision(4) ?? "—"} · max {card.statistics.maximum?.toPrecision(4) ?? "—"} · mean {card.statistics.mean?.toPrecision(4) ?? "—"}</div>}
        {card.uncertainty && <div style={{ fontSize: 10 }}>Uncertainty: {card.uncertainty.kind} {card.uncertainty.absolute ?? "—"} · {card.uncertainty.note}</div>}
        {card.warnings.map((warning, index) => <div key={index} style={{ color: "#9a3412", fontSize: 10 }}>{warning}</div>)}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          <button type="button" aria-pressed={card.layer.visible} onClick={() => changeLayer(card.resultKey, card.layer.visible ? "hide" : "show")}>{card.layer.visible ? "Hide" : "Show"}</button>
          <button type="button" aria-pressed={card.layer.selected} onClick={() => { changeLayer(card.resultKey, "select"); onSelectResult?.(card); }}>Select</button>
          <button type="button" aria-pressed={card.layer.framed} onClick={() => { changeLayer(card.resultKey, "frame"); onFrameResult?.(card); }}>Frame</button>
          <button type="button" aria-pressed={card.layer.pinned} onClick={() => changeLayer(card.resultKey, card.layer.pinned ? "unpin" : "pin")}>{card.layer.pinned ? "Unpin" : "Pin"}</button>
          <button type="button" aria-pressed={card.layer.saved} onClick={() => { changeLayer(card.resultKey, "save"); onWorkspaceChange(saveCurveResultReference(workspace, card)); }}>Save</button>
          <button type="button" aria-pressed={lifecycle.compareKeys.includes(card.resultKey)} onClick={() => onLifecycleChange(setCurveComparisonSelection(lifecycle, card.resultKey))}>Compare</button>
          <button type="button" onClick={apply}>Recompute</button>
          <button type="button" onClick={() => { const removed = removeCurveResult(store, lifecycle, card.resultKey); onStoreChange(removed.store); onLifecycleChange(removed.state); }}>Remove</button>
          <button type="button" onClick={() => download(`${card.variant}.json`, curveResultToJson(card, definition), "application/json")}>JSON</button>
          <button type="button" onClick={() => download(`${card.variant}.csv`, curveResultToCsv(card, definition), "text/csv")}>CSV</button>
          <button type="button" onClick={() => download(`${card.variant}.svg`, curveResultToSvg(card, definition), "image/svg+xml")}>SVG</button>
        </div>
      </article>)}
    </div>
    {comparison && <div data-testid="curve-result-comparison" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 6, padding: 6 }}>Common domain [{comparison.domain?.join(", ")}] · aligned {comparison.samples.length} · max |Δ| {comparison.maximumAbsoluteDelta?.toPrecision(4) ?? "—"} · RMS {comparison.rmsDelta?.toPrecision(4) ?? "—"}</div>}
  </section>;
};
