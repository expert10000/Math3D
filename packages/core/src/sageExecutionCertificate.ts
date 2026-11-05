/** Versioned, inspectable execution facts for a saved algebra operation. */
import { canonicalJsonStringify, structuralHash, type StableDocumentId,
  type StructuralHash } from "./documentIdentity";
import { ALGEBRA_OPERATION_REGISTRY, type AlgebraOperationRequest } from "./algebraOperationRegistry";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export type SageExecutionRuntime = Readonly<{ engine: "sagemath"; version: string;
  backend: "docker" | "private"; jobId: string; elapsedMs: number; warnings: readonly string[] }>;
export type SageCertificateSource = Readonly<{ objectId: StableDocumentId; revision: number;
  contentHash: StructuralHash }>;
export type SageExecutionCertificate = Readonly<{
  schemaVersion: 1; kind: "sage-execution-certificate/v1";
  operation: Readonly<{ id: string; inputSchema: string; outputSchema: string }>;
  sources: readonly SageCertificateSource[];
  requestHash: StructuralHash; inputBytes: number; resultHash: StructuralHash; outputBytes: number;
  runtime: Readonly<{ route: "docker" | "private"; sageVersion: string; jobId: string;
    wallTimeMs: number; subsystem: string | null; subsystemVersion: string | null;
    algorithm: string | null;
    proofMode: string | null; peakMemoryBytes: number | null }>;
  limits: Readonly<{ profile: string; wallTimeMs: number; maxResultBytes: number }> | null;
  outcome: Readonly<{ status: "completed"; representation: "exact" | "reported";
    warnings: readonly string[] }>;
  verifier: Readonly<{ level: "schema-and-binding"; checks: readonly ["operation-schema", "source-revisions", "result-hash"];
    mathematicalProof: false }>;
  contentHash: StructuralHash;
}>;

const bytes = (value: unknown) => new TextEncoder().encode(canonicalJsonStringify(value)).byteLength;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactRepresentation = (operation: string) => !operation.endsWith("inspectDomains");

export const createSageExecutionCertificate = (objects: readonly ProjectAlgebraObjectEntry[],
  request: AlgebraOperationRequest, result: unknown, runtime: SageExecutionRuntime): SageExecutionCertificate => {
  const definition = ALGEBRA_OPERATION_REGISTRY.find((item) => item.id === request.operation);
  if (!definition) throw new TypeError("Unknown certificate operation.");
  const refs = new Map<string, SageCertificateSource>();
  const add = (objectId: StableDocumentId, revision: number): void => {
    const key = `${objectId}@${revision}`;
    if (refs.has(key)) return;
    const record = objects.find((entry) => entry.id === objectId)?.revisions[revision - 1];
    if (!record) throw new TypeError(`Certificate source ${key} is missing.`);
    refs.set(key, { objectId, revision, contentHash: record.contentHash });
    for (const parent of record.dependencies) add(parent.objectId, parent.revision);
  };
  add(request.target.objectId, request.target.revision);
  const scan = (value: unknown, depth = 0): void => {
    if (depth > 16) throw new TypeError("Certificate request nesting exceeds its limit.");
    if (Array.isArray(value)) { value.forEach((item) => scan(item, depth + 1)); return; }
    if (!object(value)) return;
    if (typeof value.objectId === "string" && Number.isSafeInteger(value.revision))
      add(value.objectId as StableDocumentId, value.revision as number);
    Object.values(value).forEach((item) => scan(item, depth + 1));
  };
  scan(request.params);
  const budget = object(request.params.budget) ? request.params.budget : null;
  const limits = budget && typeof budget.profile === "string" &&
    typeof budget.wallTimeMs === "number" && typeof budget.maxResultBytes === "number"
    ? { profile: budget.profile, wallTimeMs: budget.wallTimeMs, maxResultBytes: budget.maxResultBytes } : null;
  const gapVersion = request.operation === "sage.group.dossier" && object(result) &&
    typeof result.gapVersion === "string" ? result.gapVersion : null;
  const body = {
    schemaVersion: 1 as const, kind: "sage-execution-certificate/v1" as const,
    operation: { id: request.operation, inputSchema: definition.inputSchema, outputSchema: request.outputSchema },
    sources: [...refs.values()].sort((a, b) => a.objectId.localeCompare(b.objectId) || a.revision - b.revision),
    requestHash: structuralHash(request), inputBytes: bytes(request), resultHash: structuralHash(result),
    outputBytes: bytes(result),
    runtime: { route: runtime.backend, sageVersion: runtime.version, jobId: runtime.jobId,
      wallTimeMs: runtime.elapsedMs, subsystem: gapVersion ? "GAP" : null,
      subsystemVersion: gapVersion, algorithm: null, proofMode: null,
      peakMemoryBytes: null },
    limits,
    outcome: { status: "completed" as const,
      representation: exactRepresentation(request.operation) ? "exact" as const : "reported" as const,
      warnings: [...runtime.warnings] },
    verifier: { level: "schema-and-binding" as const,
      checks: ["operation-schema", "source-revisions", "result-hash"] as const,
      mathematicalProof: false as const },
  };
  return { ...body, contentHash: structuralHash(body) };
};

/** Rebuild every deterministic field; a certificate cannot assert unreported facts on import. */
export const parseSageExecutionCertificate = (value: unknown,
  objects: readonly ProjectAlgebraObjectEntry[], request: AlgebraOperationRequest,
  result: unknown, runtime: SageExecutionRuntime): SageExecutionCertificate => {
  const expected = createSageExecutionCertificate(objects, request, result, runtime);
  if (canonicalJsonStringify(value) !== canonicalJsonStringify(expected))
    throw new TypeError("Sage execution certificate differs from its saved sources, runtime or result.");
  return expected;
};
