import React, { useState } from "react";
import type { SurfaceDocument } from "@math3d/core";
import { sourceFromSurfaceFormulaFields, surfaceFormulaFields } from "./surfaceFormulaFields";

export const SurfaceFormulaControls = ({ document, onApply }: { document: SurfaceDocument; onApply: (source: SurfaceDocument["source"]) => void }) => {
  const fields = surfaceFormulaFields(document);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.id, field.value])));
  const [error, setError] = useState<string | null>(null);
  if (!fields.length) return null;
  return <form data-testid="project-surface-formulas" style={{ padding: "0 10px 10px", display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }} onSubmit={event => {
    event.preventDefault();
    try { onApply(sourceFromSurfaceFormulaFields(document, values)); setError(null); }
    catch (failure) { setError((failure as Error).message); }
  }}>
    {fields.map(field => <label key={field.id} style={{ display: "grid", gap: 3, maxWidth: "100%" }}>{field.label}
      <input data-testid={`project-surface-field-${field.id}`} type={field.numeric ? "number" : "text"} step={field.numeric ? "any" : undefined} value={values[field.id]} onChange={event => setValues(before => ({ ...before, [field.id]: event.target.value }))} style={{ width: field.numeric ? 85 : 220, maxWidth: "100%", boxSizing: "border-box" }} />
    </label>)}
    <button type="submit" data-testid="project-surface-apply">Apply surface</button>
    {error && <span role="alert">{error}</span>}
  </form>;
};
