import React, { useState } from "react";
import SageSymbolicPanel, { type SymbolicResultRecord } from "../sageLab/SageSymbolicPanel";
import {
  SCIENTIFIC_SERVICE_PRESETS,
  scientificOperationsFor,
  type ScientificServiceContext,
  type ScientificServicePreset,
} from "./operationCatalog";

export const ScientificServicesPanel: React.FC<{
  context: ScientificServiceContext;
  sourceExpression?: string;
  sourceProvenance?: SymbolicResultRecord["source"];
  sourceLabel?: string;
  sourceVariables?: string;
  onResult: (record: SymbolicResultRecord) => void;
  onOpenRuntimes?: () => void;
}> = ({ context, sourceExpression, sourceProvenance, sourceLabel, sourceVariables, onResult, onOpenRuntimes }) => {
  const [preset, setPreset] = useState<ScientificServicePreset>(context === "number_theory" ? "Number Theory" : "All");
  const operations = scientificOperationsFor(context, preset);

  return <section data-testid={`scientific-services-${context}`} style={{ display: "grid", gap: 8 }}>
    <div style={{ fontSize: 12, fontWeight: 700 }}>Scientific operations</div>
    <label style={{ display: "grid", gap: 4, fontSize: 11 }}>
      <span>Services preset</span>
      <select aria-label="Services preset" value={preset} onChange={(event) => setPreset(event.target.value as ScientificServicePreset)}>
        {SCIENTIFIC_SERVICE_PRESETS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
      </select>
    </label>
    <div style={{ color: "#667085", fontSize: 11 }}>
      {context === "surface" ? "Surface" : context === "geometry" ? "Geometry" : context === "graphs" ? "Graphs" : context === "number_theory" ? "Number Theory" : "CAS / Algebra"} operations use the same SageMath request and result contract.
      Inspect completed results in Inspector → Analysis.
    </div>
    {operations.length
      ? <SageSymbolicPanel key={preset} compact sourceExpression={sourceExpression} sourceProvenance={sourceProvenance}
          sourceLabel={sourceLabel} sourceVariables={sourceVariables}
          operations={operations} onResult={onResult} onOpenRuntimes={onOpenRuntimes} />
      : <div role="status" style={{ fontSize: 11, color: "#667085" }}>No {preset.toLowerCase()} operation is registered for {context} yet.</div>}
  </section>;
};
