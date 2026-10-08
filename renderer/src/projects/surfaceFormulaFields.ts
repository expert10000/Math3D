import type { SurfaceDocument } from "@math3d/core";

export type SurfaceFormulaField = { id: string; label: string; value: string; numeric?: boolean; options?: readonly string[] };
/** Source controls preserve captured construction specifications and lineage. */
export const surfaceFormulaFields = (document: SurfaceDocument): SurfaceFormulaField[] => {
  const { representation, definition, domain } = document.source;
  const expressions = definition.expressions ?? {};
  if (representation === "constructed" && ["graph2d.revolution", "graph2d.extrusion"].includes(definition.familyId)) {
    const d = domain as unknown as { profile: { min: number; max: number; includeMin: boolean; includeMax: boolean } };
    const fields: SurfaceFormulaField[] = ["x", "y"].map(id => ({ id, label: `${id}(${document.source.parameters.parameter ?? "x"}) profile`, value: expressions[id] ?? "" }));
    for (const bound of ["min", "max"] as const) fields.push({ id: `profile.${bound}`, label: `Profile ${bound}`, value: String(d.profile[bound]), numeric: true });
    for (const bound of ["includeMin", "includeMax"] as const) fields.push({ id: bound, label: bound === "includeMin" ? "First endpoint" : "Last endpoint", value: String(d.profile[bound]), options: ["true", "false"] });
    for (const [name, value] of Object.entries((document.source.parameters.variables ?? {}) as Record<string, number>)) fields.push({ id: `variable.${name}`, label: `Captured ${name}`, value: String(value), numeric: true });
    if (definition.familyId === "graph2d.revolution") {
      fields.push({ id: "axis", label: "Axis", value: String(document.source.parameters.axis), options: ["x", "y"] },
        { id: "orientation", label: "Orientation", value: String(definition.settings?.orientation), options: ["positive", "negative"] });
      for (const bound of ["angleMin", "angleMax"] as const) fields.push({ id: bound, label: `${bound} (rad)`, value: String(document.source.parameters[bound]), numeric: true });
    }
    return fields;
  }
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
  if (source.representation === "constructed" && ["graph2d.revolution", "graph2d.extrusion"].includes(definition.familyId)) {
    const parameters = { ...source.parameters };
    for (const field of surfaceFormulaFields(document)) {
      const value = values[field.id]?.trim();
      if (!value) throw new TypeError(`Enter ${field.label}.`);
      if (field.options && !field.options.includes(value)) throw new TypeError(`Invalid ${field.label}.`);
      if (field.numeric && !Number.isFinite(Number(value))) throw new TypeError(`Enter a finite ${field.label}.`);
      if (["x", "y"].includes(field.id)) definition.expressions = { ...definition.expressions, [field.id]: value };
      else if (field.id.startsWith("profile.")) d.profile[field.id.split(".")[1]] = Number(value);
      else if (field.id.startsWith("variable.")) parameters.variables = { ...(parameters.variables as Record<string, number>), [field.id.slice(9)]: Number(value) };
      else if (["includeMin", "includeMax"].includes(field.id)) d.profile[field.id] = value === "true";
      else if (["angleMin", "angleMax"].includes(field.id)) { parameters[field.id] = Number(value); d.angle[field.id === "angleMin" ? "min" : "max"] = Number(value); }
      else { definition.settings = { ...definition.settings, [field.id]: value }; if (field.id === "axis") parameters.axis = value; }
    }
    if (d.profile.min >= d.profile.max) throw new TypeError("Profile min must be smaller than max.");
    if (definition.familyId === "graph2d.revolution" && (!(Number(parameters.angleMin) < Number(parameters.angleMax)) || Number(parameters.angleMax) - Number(parameters.angleMin) > 2 * Math.PI)) throw new TypeError("Use an increasing angular range of at most one turn.");
    return { ...source, definition, parameters, orientation: definition.familyId === "graph2d.revolution" ? { direction: definition.settings!.orientation } : source.orientation };
  }
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
