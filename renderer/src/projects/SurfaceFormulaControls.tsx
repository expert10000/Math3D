import React, { useState } from "react";
import type { SurfaceDocument } from "@math3d/core";
import { sourceFromSurfaceFormulaFields, surfaceFormulaFields } from "./surfaceFormulaFields";
import { MathExpressionInput } from "../math/MathExpressionInput";

export const SurfaceFormulaControls = ({ document, onApply }: { document: SurfaceDocument; onApply: (source: SurfaceDocument["source"]) => void }) => {
  const fields = surfaceFormulaFields(document);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.id, field.value])));
  const [error, setError] = useState<string | null>(null);
  if (!fields.length) return null;
  const profile = document.source.representation === "weierstrass" ? "complex" :
    document.source.representation === "constructed" ? "graph" : "real";
  const variables = document.source.representation === "weierstrass" ? ["z"] :
    document.source.representation === "constructed" ? [String(document.source.parameters.parameter ?? "x"),
      ...Object.keys((document.source.parameters.variables ?? {}) as Record<string, number>)] :
      document.source.representation === "parametric" ? ["u", "v"] :
        document.source.representation === "implicit" ? ["x", "y", "z"] : ["x", "y"];
  return <form data-testid="project-surface-formulas" style={{ padding: "0 10px 10px", display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }} onSubmit={event => {
    event.preventDefault();
    try { onApply(sourceFromSurfaceFormulaFields(document, values)); setError(null); }
    catch (failure) { setError((failure as Error).message); }
  }}>
    {fields.map(field => field.options || field.numeric ? <label key={field.id} style={{ display: "grid", gap: 3, maxWidth: "100%" }}>{field.label}
      {field.options ? <select data-testid={`project-surface-field-${field.id}`} value={values[field.id]} onChange={event => setValues(before => ({ ...before, [field.id]: event.target.value }))}>{field.options.map(option => <option key={option}>{option}</option>)}</select>
        : <input data-testid={`project-surface-field-${field.id}`} type="number" step="any" value={values[field.id]} onChange={event => setValues(before => ({ ...before, [field.id]: event.target.value }))} style={{ width: 85, maxWidth: "100%", boxSizing: "border-box" }} />}
    </label> : <div key={field.id} style={{ width: 220, maxWidth: "100%" }}><MathExpressionInput label={field.label}
      ariaLabel={field.label} inputTestId={`project-surface-field-${field.id}`} profile={profile} variables={variables}
      value={values[field.id]} onChange={value => setValues(before => ({ ...before, [field.id]: value }))} /></div>)}
    <button type="submit" data-testid="project-surface-apply">Apply surface</button>
    {error && <span role="alert">{error}</span>}
  </form>;
};
