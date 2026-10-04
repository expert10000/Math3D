import type { SurfaceDocument } from "@math3d/core";

export type SurfaceFormulaField = { id: string; label: string; value: string; numeric?: boolean };
/** Only literal recipes are edited here; construction specifications stay in Advanced. */
export const surfaceFormulaFields = (document: SurfaceDocument): SurfaceFormulaField[] => {
  const { representation, definition, domain } = document.source;
  const expressions = definition.expressions ?? {};
  const names = representation === "weierstrass" ? ["g", "phi"] : representation === "parametric" ? ["x", "y", "z"] : ["explicit", "implicit"].includes(representation) ? ["formula"] : [];
  if (!names.length) return [];
  const fields = names.map(id => ({ id, label: representation === "weierstrass" ? `${id}(z)` : id === "formula" ? representation === "implicit" ? "F(x,y,z) = isovalue" : "z = f(x,y)" : `${id}(u,v)`, value: expressions[id] ?? "" }));
  const d = domain as Record<string, any>;
  if (["parameter", "graph"].includes(d.kind)) {
    for (const axis of d.kind === "graph" ? ["x", "y"] : ["u", "v"]) for (const bound of ["min", "max"] as const)
      fields.push({ id: `${axis}.${bound}`, label: `${axis} ${bound}`, value: String(Array.isArray(d[axis]) ? d[axis][bound === "min" ? 0 : 1] : d[axis]?.[bound]), numeric: true } as SurfaceFormulaField);
  } else if (d.kind === "spatial-bounds") {
    for (const [index, axis] of ["x", "y", "z"].entries()) for (const bound of ["min", "max"])
      fields.push({ id: `${axis}.${bound}`, label: `${axis} ${bound}`, value: String(d[bound]?.[index]), numeric: true } as SurfaceFormulaField);
    fields.push({ id: "isoValue", label: "Isovalue", value: String(definition.settings?.isoValue ?? 0), numeric: true } as SurfaceFormulaField);
  }
  return fields;
};

export const sourceFromSurfaceFormulaFields = (document: SurfaceDocument, values: Readonly<Record<string, string>>): SurfaceDocument["source"] => {
  const source = structuredClone(document.source), d = source.domain as Record<string, any>, definition = { ...source.definition };
  for (const field of surfaceFormulaFields(document)) {
    const value = values[field.id]?.trim();
    if (!value) throw new TypeError(`Enter ${field.label}.`);
    if (!field.numeric) definition.expressions = { ...definition.expressions, [field.id]: value };
    else {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new TypeError(`Enter a finite ${field.label}.`);
      if (field.id === "isoValue") definition.settings = { ...definition.settings, isoValue: number };
      else {
        const [axis, bound] = field.id.split(".");
        if (d.kind === "spatial-bounds") d[bound][["x", "y", "z"].indexOf(axis)] = number;
        else if (Array.isArray(d[axis])) d[axis][bound === "min" ? 0 : 1] = number;
        else d[axis][bound] = number;
      }
    }
  }
  for (const axis of d.kind === "graph" ? ["x", "y"] : d.kind === "parameter" ? ["u", "v"] : [])
    if (Array.isArray(d[axis]) ? d[axis][0] >= d[axis][1] : d[axis].min >= d[axis].max) throw new TypeError(`${axis} min must be smaller than ${axis} max.`);
  if (d.kind === "spatial-bounds" && d.min.some((min: number, i: number) => min >= d.max[i])) throw new TypeError("Each minimum must be smaller than its maximum.");
  return { ...source, definition };
};
