import { useState } from "react";
import type { ScientificFieldRange, ScientificFieldTransfer } from "./scientificFieldTransfer";

export function ScientificFieldTransferControls({ range, transfer, unit, onApply, rangeLabel = "Displayed plane range" }: {
  range: ScientificFieldRange; transfer: ScientificFieldTransfer; unit: string;
  onApply: (transfer: ScientificFieldTransfer) => void; rangeLabel?: string;
}) {
  const [mode, setMode] = useState<ScientificFieldTransfer["mode"]>(transfer.mode);
  const [minimum, setMinimum] = useState(String(transfer.mode === "manual" ? transfer.min : range.dataMin));
  const [maximum, setMaximum] = useState(String(transfer.mode === "manual" ? transfer.max : range.dataMax));
  const manualValid = minimum.trim() !== "" && maximum.trim() !== "" &&
    Number.isFinite(Number(minimum)) && Number.isFinite(Number(maximum)) && Number(minimum) < Number(maximum);
  return <div className="graph2d-scientific-transfer">
    <div className="graph2d-scientific-transfer-controls">
      <label>Color range <select value={mode} onChange={event => setMode(event.target.value as ScientificFieldTransfer["mode"])}>
        <option value="data">{rangeLabel === "Displayed sample range" ? "Full displayed sample range" : "Full displayed range"}</option>
        <option value="percentile">Clip 2–98% outliers</option>
        <option value="manual">Manual range</option>
      </select></label>
      {mode === "manual" && <>
        <label>Color minimum ({unit}) <input type="number" value={minimum} onChange={event => setMinimum(event.target.value)} /></label>
        <label>Color maximum ({unit}) <input type="number" value={maximum} onChange={event => setMaximum(event.target.value)} /></label>
      </>}
      <button type="button" disabled={mode === "manual" && !manualValid} onClick={() => onApply(mode === "manual" ?
        { mode, min: Number(minimum), max: Number(maximum) } : { mode })}>Apply verified color range</button>
    </div>
    {mode === "manual" && !manualValid && <p role="alert">Color maximum must be greater than color minimum.</p>}
    <div className="graph2d-scientific-legend" aria-label={`Color legend, ${range.min} to ${range.max} ${unit}`}>
      <span>{range.min} {unit}</span><span className="graph2d-scientific-legend-scale" aria-hidden="true" />
      <span>{range.max} {unit}</span>
    </div>
    <p>{range.constant ? `${rangeLabel === "Displayed sample range" ? "Constant displayed samples" : "Constant displayed plane"}: ${range.dataMin} ${unit}; ${range.min === range.max ?
      "shown at the midpoint color." : "color follows the selected range."}` :
      `${rangeLabel} ${range.dataMin} to ${range.dataMax} ${unit}. ${range.min === range.max ?
        "Selected color range has one value; matching samples use the midpoint color." : ""}`}
      {range.below + range.above > 0 && ` ${range.below} below and ${range.above} above the color range are clamped; source values are unchanged.`}
    </p>
  </div>;
}
