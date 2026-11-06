/** Exact, bounded scheme presentations and canonical projective-chart handoffs. */
import { parseIdealGenerator } from "./algebraIdealGenerators";
import { isProvablyHomogeneousIdeal } from "./algebraIdealGrading";
import type { AlgebraObjectRecord, AlgebraObjectRef } from "./algebraObjects";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";
import type { Math3DProject } from "./math3dProject";

const sameRef = (a: AlgebraObjectRef, b: AlgebraObjectRef) =>
  a.objectId === b.objectId && a.revision === b.revision;
const at = (objects: readonly ProjectAlgebraObjectEntry[], ref: AlgebraObjectRef) =>
  objects.find((item) => item.id === ref.objectId)?.revisions[ref.revision - 1];

/** Registry validation preserves the ideal presentation, including nilpotent or embedded structure. */
export const validateSchemeGeometryRecord = (record: AlgebraObjectRecord,
  objects: readonly ProjectAlgebraObjectEntry[]): void => {
  const definition = record.definition;
  if (definition.kind === "affine-scheme" || definition.kind === "projective-scheme") {
    const ring = at(objects, definition.ambientRing), ideal = at(objects, definition.ideal);
    if (ring?.definition.kind !== "polynomial-ring" || ideal?.definition.kind !== "ideal" ||
        !sameRef(ideal.definition.ambientRing, definition.ambientRing))
      throw new TypeError("Scheme requires a pinned ideal in its exact polynomial ambient ring.");
    const coefficient = at(objects, ring.definition.coefficientDomain);
    if (coefficient?.kind !== "rational-field" || ideal.definition.generators.length > 6 ||
        ideal.definition.generators.some((item) => item.length > 128))
      throw new TypeError("Scheme presentations require a bounded ideal in a ring directly over QQ.");
    const count = ring.definition.variables.length;
    if (definition.kind === "affine-scheme" && (count < 1 || count > 3))
      throw new TypeError("Affine schemes require one to three ambient coordinates.");
    if (definition.kind === "projective-scheme" && (count < 2 || count > 4 ||
        ring.definition.monomialOrder === "lex" ||
        !isProvablyHomogeneousIdeal(ideal.definition.generators, ring.definition.variables)))
      throw new TypeError("Projective schemes require two to four homogeneous coordinates, a graded order and proven homogeneous generators.");
  } else if (definition.kind === "scheme-chart") {
    const projective = at(objects, definition.projectiveScheme);
    if (projective?.definition.kind !== "projective-scheme")
      throw new TypeError("A scheme chart requires a pinned projective scheme.");
    const ring = at(objects, projective.definition.ambientRing);
    if (ring?.definition.kind !== "polynomial-ring" ||
        !ring.definition.variables.includes(definition.nonzeroCoordinate))
      throw new TypeError("Chart coordinate must belong to the pinned homogeneous ring.");
  } else if (definition.kind === "scheme-map") {
    const chart = at(objects, definition.sourceChart), projective = at(objects, definition.targetProjective);
    if (definition.mapKind !== "chart-inclusion" || chart?.definition.kind !== "scheme-chart" ||
        projective?.definition.kind !== "projective-scheme" ||
        !sameRef(chart.definition.projectiveScheme, definition.targetProjective))
      throw new TypeError("Chart inclusion map must connect a pinned chart to its projective scheme.");
  }
};

export type SchemeChartFacts = Readonly<{ projective: AlgebraObjectRef; nonzeroCoordinate: string;
  affineCoordinates: readonly string[]; equations: readonly string[];
  homogeneousImages: readonly string[]; inclusion: "canonical-open-immersion" }>;

/** Substitution x_i=1 gives the degree-zero coordinate presentation on D_+(x_i). */
export const schemeChartFacts = (objects: readonly ProjectAlgebraObjectEntry[],
  chartRef: AlgebraObjectRef): SchemeChartFacts => {
  const chart = at(objects, chartRef);
  if (chart?.definition.kind !== "scheme-chart") throw new TypeError("Choose a pinned projective chart.");
  validateSchemeGeometryRecord(chart, objects);
  const projective = at(objects, chart.definition.projectiveScheme)!;
  if (projective.definition.kind !== "projective-scheme") throw new TypeError("Missing projective scheme.");
  validateSchemeGeometryRecord(projective, objects);
  const ring = at(objects, projective.definition.ambientRing)!;
  const ideal = at(objects, projective.definition.ideal)!;
  if (ring.definition.kind !== "polynomial-ring" || ideal.definition.kind !== "ideal")
    throw new TypeError("Missing chart coordinate presentation.");
  const coordinate = chart.definition.nonzeroCoordinate;
  const affineCoordinates = ring.definition.variables.filter((item) => item !== coordinate);
  const equations = ideal.definition.generators.map((generator) => {
    const substituted = generator.replace(/[A-Za-z][A-Za-z0-9_]*/g,
      (token) => token === coordinate ? "1" : token).replace(/(?<![A-Za-z0-9_])1\^([0-9]+)/g, "1")
      .replace(/(?:^|\*)1\*/g, (match) => match.startsWith("*") ? "*" : "")
      .replace(/\*1(?=$|[+\-)])/g, "");
    return parseIdealGenerator(substituted, affineCoordinates);
  });
  return { projective: chart.definition.projectiveScheme, nonzeroCoordinate: coordinate,
    affineCoordinates, equations,
    homogeneousImages: ring.definition.variables.map((item) => item === coordinate ? "1" : item),
    inclusion: "canonical-open-immersion" };
};

/** The existing real-locus builder consumes the same pinned ideal, with a separate numerical-domain decision. */
export const affineSchemeRealLocusTarget = (project: Math3DProject,
  schemeRef: AlgebraObjectRef): AlgebraObjectRef => {
  const scheme = at(project.algebraObjects ?? [], schemeRef);
  if (scheme?.definition.kind !== "affine-scheme") throw new TypeError("Choose a saved affine scheme.");
  validateSchemeGeometryRecord(scheme, project.algebraObjects ?? []);
  return scheme.definition.ideal;
};
