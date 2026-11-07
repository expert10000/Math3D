import { canonicalJsonStringify, parseProjectAlgebraEvidence,
  type Math3DProject, type ProjectAlgebraEvidence } from "@math3d/core";
import { algebraEvidenceInspectorModel } from "./algebraEvidenceInspectorModel";

export type AlgebraComparisonSide = Readonly<{ evidenceId: string; operation: string; domain: string;
  backend: string; sageVersion: string; target: string; verification: string;
  resultHash: string; certificate: string;
  facts: readonly Readonly<{ label: string; value: string }> [] }>;
export type AlgebraEvidenceComparison = Readonly<{ kind: "backend" | "domain" | "incompatible";
  verdict: "verified agreement" | "reported consistency" | "discrepancy" | "verification failed" | "incompatible";
  explanation: string; checks: readonly string[]; left: AlgebraComparisonSide; right: AlgebraComparisonSide }>;

const object = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
const label = (project: Math3DProject, evidence: ProjectAlgebraEvidence) => {
  const record = project.algebraObjects?.find((item) => item.id === evidence.request.target.objectId)
    ?.revisions[evidence.request.target.revision - 1];
  return `${record?.label ?? evidence.request.target.objectId}@${evidence.request.target.revision}`;
};
const side = (project: Math3DProject, evidence: ProjectAlgebraEvidence): AlgebraComparisonSide => {
  const inspector = algebraEvidenceInspectorModel(project, evidence);
  const record = project.algebraObjects?.find((item) => item.id === evidence.request.target.objectId)
    ?.revisions[evidence.request.target.revision - 1];
  const result = object(evidence.result);
  const facts: { label: string; value: string }[] = [];
  if (evidence.request.operation === "sage.numberTheory.gcd" || evidence.request.operation === "sage.numberTheory.modInverse") {
    facts.push({ label: "Exact value", value: String(result.value) });
    if (evidence.request.operation === "sage.numberTheory.modInverse")
      facts.push({ label: "Modulus", value: String(result.modulus) });
  } else if (evidence.request.operation === "sage.matrix.linear_dossier") {
    facts.push({ label: "Rank over QQ", value: String(result.rank) },
      { label: "Kernel dimension over QQ", value: String((result.inputShape as number[])[1] - Number(result.rank)) },
      { label: "RREF", value: canonicalJsonStringify(result.reducedRowEchelonForm) });
  } else if (evidence.request.operation === "sage.matrix.integer_forms") {
    const smith = object(result.smith), cokernel = object(result.cokernel);
    facts.push({ label: "Rank over ZZ", value: String(result.rank) },
      { label: "Smith diagonal", value: (smith.diagonal as string[]).join(", ") },
      { label: "Cokernel free rank", value: String(cokernel.freeRank) },
      { label: "Cokernel torsion", value: (cokernel.torsionOrders as string[]).join(", ") || "None" });
  }
  return { evidenceId: evidence.id, operation: evidence.request.operation,
    domain: record?.kind === "rational-field" ? "QQ" : record?.kind === "integer-ring" ? "ZZ"
      : record?.kind === "modular-ring" ? `Z/${record.definition.kind === "modular-ring" ? record.definition.modulus : "?"}Z`
        : record?.kind ?? "Unknown",
    backend: evidence.runtime.backend, sageVersion: evidence.runtime.version,
    target: label(project, evidence), verification: inspector.mode, resultHash: evidence.resultHash,
    certificate: evidence.certificate ? `${evidence.certificate.verifier.level}; no mathematical proof claimed`
      : "Legacy evidence without an execution certificate", facts };
};
const incompatible = (left: AlgebraComparisonSide, right: AlgebraComparisonSide, explanation: string): AlgebraEvidenceComparison =>
  ({ kind: "incompatible", verdict: "incompatible", explanation, checks: [], left, right });
const invalidSide = (project: Math3DProject, evidence: ProjectAlgebraEvidence): AlgebraComparisonSide =>
  ({ evidenceId: evidence.id, operation: evidence.request.operation, domain: "Unverified",
    backend: evidence.runtime.backend, sageVersion: evidence.runtime.version,
    target: label(project, evidence), verification: "FAILED", resultHash: evidence.resultHash,
    certificate: "Unverified", facts: [] });
const sameMatrix = (left: unknown, right: unknown) => Array.isArray(left) && Array.isArray(right) &&
  left.length === right.length && left.every((row, i) => Array.isArray(row) && Array.isArray(right[i]) &&
    row.length === right[i].length && row.every((item, j) => typeof item === "string" &&
      /^(?:0|-?[1-9][0-9]*)$/.test(item) && item === right[i][j]));

/** Compares typed invariants only after each evidence envelope and pinned source are revalidated. */
export const compareAlgebraEvidence = (project: Math3DProject, leftEvidence: ProjectAlgebraEvidence,
  rightEvidence: ProjectAlgebraEvidence): AlgebraEvidenceComparison => {
  try {
    parseProjectAlgebraEvidence(leftEvidence, project.identity.id, project.algebraObjects ?? []);
    parseProjectAlgebraEvidence(rightEvidence, project.identity.id, project.algebraObjects ?? []);
  } catch (error) { return { ...incompatible(invalidSide(project, leftEvidence), invalidSide(project, rightEvidence),
    "Evidence integrity or pinned source validation failed."),
    verdict: "verification failed", checks: [String((error as Error).message ?? error)] }; }
  const left = side(project, leftEvidence), right = side(project, rightEvidence);
  const a = leftEvidence.request, b = rightEvidence.request;
  if (a.operation === b.operation && ["sage.numberTheory.gcd", "sage.numberTheory.modInverse"].includes(a.operation)) {
    if (a.backend === b.backend || a.target.objectId !== b.target.objectId ||
        a.target.revision !== b.target.revision || leftEvidence.targetHash !== rightEvidence.targetHash ||
        canonicalJsonStringify(a.params) !== canonicalJsonStringify(b.params))
      return incompatible(left, right, "Backend comparison requires different routes and the same pinned object revision and exact inputs.");
    const exactLeft = String(object(leftEvidence.result).value), exactRight = String(object(rightEvidence.result).value);
    const checked = left.verification === "CHECKED" && right.verification === "CHECKED";
    return { kind: "backend", verdict: !checked ? "verification failed" : exactLeft === exactRight
      ? "verified agreement" : "discrepancy",
      explanation: !checked ? "At least one result failed the Inspector's exact arithmetic check."
        : exactLeft === exactRight ? "Both routes returned the same independently checked exact value."
          : "The routes disagree on the exact value for identical pinned inputs.",
      checks: ["Same pinned object and structured inputs", "Distinct Sage routes", "Independent exact arithmetic checks"],
      left, right };
  }
  const matrixPair = a.operation === "sage.matrix.linear_dossier" && b.operation === "sage.matrix.integer_forms"
    ? [leftEvidence, rightEvidence, left, right] as const
    : a.operation === "sage.matrix.integer_forms" && b.operation === "sage.matrix.linear_dossier"
      ? [rightEvidence, leftEvidence, right, left] as const : null;
  if (matrixPair) {
    const [qq, zz, qqSide, zzSide] = matrixPair;
    const qqResult = object(qq.result), zzResult = object(zz.result);
    if (qqSide.domain !== "QQ" || zzSide.domain !== "ZZ" ||
        !sameMatrix(qq.request.params.matrix, zz.request.params.matrix))
      return incompatible(left, right, "Domain comparison requires the same integer matrix saved over QQ and ZZ.");
    const rankAgrees = qqResult.rank === zzResult.rank;
    return { kind: "domain", verdict: rankAgrees ? "reported consistency" : "discrepancy",
      explanation: rankAgrees ? "Rank agrees after extending scalars from ZZ to QQ. Smith torsion is retained only in the ZZ view."
        : "The two saved results report different ranks for the same integer matrix.",
      checks: ["Identical canonical integer source matrix", "Pinned QQ and ZZ domains",
        "Typed rank comparison; full QQ row equivalence is not independently certified"], left, right };
  }
  return incompatible(left, right, "No typed comparison is defined for these operation and domain combinations.");
};
