import { canonicalJsonStringify, createStableDocumentId, isStableDocumentId, isStructuralHash,
  structuralHash, type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { ALGEBRA_OPERATION_REGISTRY, parseAlgebraOperationResult,
  type AlgebraOperationRequest, type AlgebraOperationResult } from "./algebraOperationRegistry";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";
import { validateSageIdealSnapshot, type SageIdealInput, type SageIdealOperation } from "./sageIdealOperations";
import { parseSageNumberFieldInput, validateSageNumberFieldSnapshot,
  type SageNumberFieldOperation } from "./sageNumberFieldOperations";
import { parseSageGaloisInput, validateSageGaloisSnapshot } from "./sageGaloisAnalysis";
import { parseSageFiniteGroupInput, validateSageFiniteGroupSnapshot } from "./sageFiniteGroupOperations";
import { parseSageModuleInvariantInput, validateSageModuleInvariantSnapshot } from "./sageModuleInvariantFactors";
import { parseSageChainHomologyInput, validateSageChainHomologySnapshot } from "./sageChainHomology";
import { parseSageFiniteFieldInput, validateSageFiniteFieldSnapshot } from "./sageFiniteFieldExplorer";
import { validateSagePadicSnapshot } from "./sagePadicWorkspace";
import { validateSageLocalExtensionSnapshot } from "./sageLocalExtensions";
import { validateSageEllipticCurveSnapshot } from "./sageEllipticCurve";
import { createSageExecutionCertificate, parseSageExecutionCertificate,
  type SageExecutionCertificate } from "./sageExecutionCertificate";

export const MAX_PROJECT_ALGEBRA_EVIDENCE = 128;
export type ProjectAlgebraEvidence = Readonly<{
  id: StableDocumentId;
  projectId: StableDocumentId;
  targetHash: StructuralHash;
  request: AlgebraOperationRequest;
  result: AlgebraOperationResult;
  resultHash: StructuralHash;
  certificate?: SageExecutionCertificate;
  runtime: Readonly<{ engine: "sagemath"; version: string; backend: "docker" | "private";
    jobId: string; elapsedMs: number; warnings: readonly string[] }>;
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const evidenceId = (projectId: StableDocumentId, jobId: string) =>
  createStableDocumentId("algebra-evidence", { projectId, jobId });

/** Successful, schema-checked Sage output pinned to one immutable object revision. */
export const createProjectAlgebraEvidence = (projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[], request: AlgebraOperationRequest, result: unknown,
  runtime: ProjectAlgebraEvidence["runtime"]): ProjectAlgebraEvidence => {
  const entry = objects.find((item) => item.id === request.target.objectId);
  const target = entry?.revisions[request.target.revision - 1];
  if (!target) throw new TypeError("Algebra evidence target revision is missing.");
  const checked = parseAlgebraOperationResult(request, result);
  const value = { id: evidenceId(projectId, runtime.jobId), projectId, targetHash: target.contentHash,
    request, result: checked, resultHash: structuralHash(checked), runtime,
    certificate: createSageExecutionCertificate(objects, request, checked, runtime) };
  return parseProjectAlgebraEvidence(value, projectId, objects);
};

export const parseProjectAlgebraEvidence = (value: unknown, projectId: StableDocumentId,
  objects: readonly ProjectAlgebraObjectEntry[]): ProjectAlgebraEvidence => {
  if (!object(value) || !(exact(value, ["id", "projectId", "targetHash", "request", "result", "resultHash", "runtime"]) ||
      exact(value, ["id", "projectId", "targetHash", "request", "result", "resultHash", "runtime", "certificate"])) ||
      !isStableDocumentId(value.id) || value.projectId !== projectId || !isStructuralHash(value.targetHash) ||
      !isStructuralHash(value.resultHash) || !object(value.request) ||
      !exact(value.request, ["operation", "backend", "params", "target", "outputSchema"]) ||
      !object(value.request.target) || !exact(value.request.target, ["objectId", "revision"]) ||
      !isStableDocumentId(value.request.target.objectId) ||
      !Number.isSafeInteger(value.request.target.revision) || (value.request.target.revision as number) < 1 ||
      !object(value.request.params) || !object(value.runtime) ||
      !exact(value.runtime, ["engine", "version", "backend", "jobId", "elapsedMs", "warnings"])) {
    throw new TypeError("Invalid Project algebra evidence envelope.");
  }
  const runtime = value.runtime;
  if (runtime.engine !== "sagemath" || typeof runtime.version !== "string" || !runtime.version ||
      runtime.version.length > 120 || !["docker", "private"].includes(String(runtime.backend)) ||
      typeof runtime.jobId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(runtime.jobId) ||
      !Number.isFinite(runtime.elapsedMs) || (runtime.elapsedMs as number) < 0 ||
      !Array.isArray(runtime.warnings) || runtime.warnings.length > 32 ||
      !runtime.warnings.every((item: unknown) => typeof item === "string" && item.length <= 1000) ||
      value.id !== evidenceId(projectId, runtime.jobId) ||
      value.request.backend !== runtime.backend) throw new TypeError("Invalid Sage evidence provenance.");
  const request = value.request as AlgebraOperationRequest;
  const definition = ALGEBRA_OPERATION_REGISTRY.find((item) => item.id === request.operation);
  const target = objects.find((item) => item.id === request.target.objectId)
    ?.revisions[request.target.revision - 1];
  if (!definition || !target || target.contentHash !== value.targetHash ||
      !definition.accepts.includes(target.kind) || !definition.backends.includes(request.backend) ||
      request.outputSchema !== definition.outputSchema) throw new TypeError("Algebra evidence operation or pinned target does not match Project objects.");
  if (request.operation.startsWith("sage.ideal."))
    validateSageIdealSnapshot(request.params as SageIdealInput, request.operation as SageIdealOperation, objects);
  if (request.operation === "sage.numberField.elementDossier" || request.operation === "sage.numberField.primeDecomposition")
    validateSageNumberFieldSnapshot(parseSageNumberFieldInput(request.params,
      request.operation as SageNumberFieldOperation), objects);
  if (request.operation === "sage.galois.analyze")
    validateSageGaloisSnapshot(parseSageGaloisInput(request.params), projectId, objects);
  if (request.operation === "sage.group.dossier")
    validateSageFiniteGroupSnapshot(parseSageFiniteGroupInput(request.params), projectId, objects);
  if (request.operation === "sage.module.invariantFactors")
    validateSageModuleInvariantSnapshot(parseSageModuleInvariantInput(request.params), projectId, objects);
  if (request.operation === "sage.chain.homology")
    validateSageChainHomologySnapshot(parseSageChainHomologyInput(request.params), projectId, objects);
  if (request.operation === "sage.finiteField.explore")
    validateSageFiniteFieldSnapshot(parseSageFiniteFieldInput(request.params), projectId, objects);
  if (request.operation === "sage.numberTheory.padic")
    validateSagePadicSnapshot(request.params, projectId, objects);
  if (request.operation === "sage.numberField.localExtensions")
    validateSageLocalExtensionSnapshot(request.params, projectId, objects);
  if (request.operation === "sage.ellipticCurve.dossier")
    validateSageEllipticCurveSnapshot(request.params, projectId, objects);
  const result = parseAlgebraOperationResult(request, value.result);
  if (structuralHash(result) !== value.resultHash) throw new TypeError("Algebra evidence result hash does not match.");
  if (value.certificate !== undefined)
    parseSageExecutionCertificate(value.certificate, objects, request, result,
      runtime as ProjectAlgebraEvidence["runtime"]);
  return JSON.parse(canonicalJsonStringify(value)) as ProjectAlgebraEvidence;
};
