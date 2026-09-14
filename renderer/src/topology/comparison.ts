import type { QuotientBuildResult } from "./types";

export const TOPOLOGY_COMPARISON_VERSION = "topology-invariant-comparison@1" as const;

export type TopologyComparisonRow = {
  id: string;
  label: string;
  authority: "exact invariant" | "certified surface invariant" | "derived presentation" | "non-authoritative display";
  left: string;
  right: string;
  status: "match" | "different" | "unavailable";
  distinguishes: boolean;
  explanation: string;
};

export type TopologyComparisonReport = {
  version: typeof TOPOLOGY_COMPARISON_VERSION;
  outcome: "distinguished" | "inconclusive";
  summary: string;
  witnesses: TopologyComparisonRow[];
  rows: TopologyComparisonRow[];
  disclaimer: "Matching computed invariants do not prove equivalence or homeomorphism.";
};

const comparableRow = (input: Omit<TopologyComparisonRow, "status" | "distinguishes"> & { canDistinguish: boolean }): TopologyComparisonRow => {
  const unavailable = input.left === "unavailable" || input.right === "unavailable";
  const different = !unavailable && input.left !== input.right;
  return {
    id: input.id,
    label: input.label,
    authority: input.authority,
    left: input.left,
    right: input.right,
    status: unavailable ? "unavailable" : different ? "different" : "match",
    distinguishes: different && input.canDistinguish,
    explanation: input.explanation,
  };
};

const integerHomology = (result: QuotientBuildResult, degree: 0 | 1 | 2): string =>
  result.homology.status === "exact" ? result.homology.value?.integer.groups[degree].notation ?? "unavailable" : "unavailable";

const mod2Homology = (result: QuotientBuildResult, degree: 0 | 1 | 2): string =>
  result.homology.status === "exact" ? result.homology.value?.mod2.groups[degree].notation ?? "unavailable" : "unavailable";

const certifiedSurfaceValue = (
  result: QuotientBuildResult,
  selector: (classification: NonNullable<NonNullable<QuotientBuildResult["surfaceClassification"]["value"]>["classification"]>) => string
): string => {
  const report = result.surfaceClassification.value;
  return report?.eligible && report.classification ? selector(report.classification) : "unavailable";
};

export const compareTopologyBuildResults = (
  left: QuotientBuildResult,
  right: QuotientBuildResult
): TopologyComparisonReport => {
  const rows: TopologyComparisonRow[] = [];
  rows.push(comparableRow({
    id: "euler",
    label: "Euler characteristic",
    authority: "exact invariant",
    left: String(left.quotient.invariants?.eulerCharacteristic ?? "unavailable"),
    right: String(right.quotient.invariants?.eulerCharacteristic ?? "unavailable"),
    canDistinguish: true,
    explanation: "Different Euler characteristics prove the spaces are not homotopy equivalent.",
  }));
  ([0, 1, 2] as const).forEach((degree) => {
    rows.push(comparableRow({
      id: `homology-z-${degree}`,
      label: `H${degree}(X; Z)`,
      authority: "exact invariant",
      left: integerHomology(left, degree),
      right: integerHomology(right, degree),
      canDistinguish: true,
      explanation: "Different integral homology groups prove the spaces are not homotopy equivalent.",
    }));
    rows.push(comparableRow({
      id: `homology-z2-${degree}`,
      label: `H${degree}(X; Z/2Z)`,
      authority: "exact invariant",
      left: mod2Homology(left, degree),
      right: mod2Homology(right, degree),
      canDistinguish: true,
      explanation: "Different mod-2 homology groups prove the spaces are not homotopy equivalent.",
    }));
  });
  rows.push(comparableRow({
    id: "surface-orientability",
    label: "Certified orientability",
    authority: "certified surface invariant",
    left: certifiedSurfaceValue(left, (entry) => entry.family),
    right: certifiedSurfaceValue(right, (entry) => entry.family),
    canDistinguish: true,
    explanation: "For certified compact surfaces, different orientability proves non-homeomorphism.",
  }));
  rows.push(comparableRow({
    id: "surface-boundary",
    label: "Certified boundary components",
    authority: "certified surface invariant",
    left: certifiedSurfaceValue(left, (entry) => String(entry.boundaryComponents)),
    right: certifiedSurfaceValue(right, (entry) => String(entry.boundaryComponents)),
    canDistinguish: true,
    explanation: "For certified compact surfaces, different boundary-component counts prove non-homeomorphism.",
  }));
  rows.push(comparableRow({
    id: "surface-genus",
    label: "Certified genus/crosscap",
    authority: "certified surface invariant",
    left: certifiedSurfaceValue(left, (entry) => entry.family === "orientable" ? `genus ${entry.genus ?? 0}` : `crosscaps ${entry.crosscapNumber ?? 0}`),
    right: certifiedSurfaceValue(right, (entry) => entry.family === "orientable" ? `genus ${entry.genus ?? 0}` : `crosscaps ${entry.crosscapNumber ?? 0}`),
    canDistinguish: true,
    explanation: "For certified compact surfaces, different genus/crosscap data proves non-homeomorphism.",
  }));
  rows.push(comparableRow({
    id: "pi1-presentation",
    label: "Derived π1 presentation",
    authority: "derived presentation",
    left: left.fundamentalGroup.value?.presentation ?? "unavailable",
    right: right.fundamentalGroup.value?.presentation ?? "unavailable",
    canDistinguish: false,
    explanation: "Different finite presentations can define isomorphic groups, so textual difference is not a witness.",
  }));
  const leftKind = left.realizations[0]?.kind ?? "unavailable";
  const rightKind = right.realizations[0]?.kind ?? "unavailable";
  rows.push(comparableRow({
    id: "realization-kind",
    label: "Displayed R³ realization kind",
    authority: "non-authoritative display",
    left: leftKind,
    right: rightKind,
    canDistinguish: false,
    explanation: "Display realization type is not a topological invariant and never distinguishes the abstract spaces.",
  }));

  const witnesses = rows.filter((row) => row.distinguishes);
  const outcome = witnesses.length > 0 ? "distinguished" : "inconclusive";
  return {
    version: TOPOLOGY_COMPARISON_VERSION,
    outcome,
    summary: outcome === "distinguished"
      ? `Distinguished by ${witnesses.length} computed invariant witness${witnesses.length === 1 ? "" : "es"}.`
      : "No computed invariant currently distinguishes these objects; equivalence remains unproved.",
    witnesses,
    rows,
    disclaimer: "Matching computed invariants do not prove equivalence or homeomorphism.",
  };
};
