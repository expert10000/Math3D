import { canonicalJsonStringify, isStableDocumentId, isStructuralHash, structuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { isScientificSourceGeneration, matchesScientificSourceGeneration,
  type ScientificSourceGeneration } from "./scientificJobs";
import { inspectProjectStudyMembers } from "./studyOperations";
import { projectResourceInventory, verifyProjectResourceBytes,
  type ProjectResourceKind, type ProjectResourceReader } from "./projectResources";
import { viewerSourceFromDocument } from "./viewerProvenance";
import type { Math3DProject } from "./math3dProject";

export const RESEARCH_REFERENCE_FORMAT = "math3d.research-reference/v1" as const;
export type ResearchResourcePin = Readonly<{ kind: ProjectResourceKind; id: string;
  descriptorHash: StructuralHash; checksum: string | null }>;
export type ResearchReference = Readonly<{
  format: typeof RESEARCH_REFERENCE_FORMAT; schemaVersion: 1;
  projectId: StableDocumentId; kind: "document" | "result" | "study" | "selection";
  targetId: string; source: ScientificSourceGeneration; targetHash: StructuralHash;
  selectionId?: string; resources: readonly ResearchResourcePin[];
}>;
export type ResearchReferenceInspection = Readonly<{ status: "current" | "historical" | "missing" | "invalid" | "different-project";
  resourceStatus: "verified" | "not-checked" | "missing"; reason: string }>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const token = (value: unknown): value is string => typeof value === "string" &&
  value.length > 0 && value.length <= 256 && value.trim() === value;
const resourceKinds = new Set<ProjectResourceKind>(["mesh-buffers", "graph-point-table", "volume-payload", "workbook-payload"]);

export function normalizeResearchReference(value: unknown): ResearchReference | null {
  if (!record(value) || Object.keys(value).sort().join("|") !==
    ["format", "schemaVersion", "projectId", "kind", "targetId", "source", "targetHash", "resources",
      ...("selectionId" in value ? ["selectionId"] : [])].sort().join("|") ||
    value.format !== RESEARCH_REFERENCE_FORMAT || value.schemaVersion !== 1 ||
    !isStableDocumentId(value.projectId) || !value.projectId.startsWith("math3d:project:") ||
    !["document", "result", "study", "selection"].includes(String(value.kind)) ||
    !token(value.targetId) || !isScientificSourceGeneration(value.source) ||
    !isStructuralHash(value.targetHash) || !Array.isArray(value.resources) || value.resources.length > 32 ||
    (value.kind === "document" && value.targetId !== value.source.documentId) ||
    (value.kind === "selection" ? !token(value.selectionId) : "selectionId" in value)) return null;
  const seen = new Set<string>();
  for (const pin of value.resources) {
    if (!record(pin) || Object.keys(pin).sort().join("|") !== "checksum|descriptorHash|id|kind" ||
      !resourceKinds.has(pin.kind as ProjectResourceKind) || !token(pin.id) ||
      !isStructuralHash(pin.descriptorHash) || pin.checksum !== null &&
      (typeof pin.checksum !== "string" || !/^sha256:[a-f0-9]{64}$/.test(pin.checksum))) return null;
    const key = `${pin.kind}:${pin.id}`;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return JSON.parse(canonicalJsonStringify(value)) as ResearchReference;
}

export function createResearchReference(input: Omit<ResearchReference, "format" | "schemaVersion">): ResearchReference {
  const result = normalizeResearchReference({ format: RESEARCH_REFERENCE_FORMAT, schemaVersion: 1, ...input });
  if (!result) throw new TypeError("Invalid source-pinned research reference.");
  return result;
}

/** A descriptor pin records identity; callers supply bytes when publication needs verification. */
export function researchResourcePins(project: Math3DProject, sourceId: StableDocumentId): readonly ResearchResourcePin[] {
  return projectResourceInventory(project).filter(item => item.required && item.owners.includes(sourceId))
    .map(item => ({ kind: item.kind, id: item.id, descriptorHash: structuralHash(item.reference), checksum: item.checksum }))
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

/** Source and target identity are separate from the availability of required sidecar bytes. */
export function inspectResearchReference(project: Math3DProject, candidate: unknown,
  readResource?: ProjectResourceReader): ResearchReferenceInspection {
  const ref = normalizeResearchReference(candidate);
  if (!ref) return { status: "invalid", resourceStatus: "not-checked", reason: "Invalid research reference." };
  if (ref.projectId !== project.identity.id) return { status: "different-project", resourceStatus: "not-checked",
    reason: "Reference belongs to another Project." };
  const sourceEntry = project.workspace.entries.find(item => item.expected.id === ref.source.documentId);
  if (!sourceEntry) return { status: "missing", resourceStatus: "missing", reason: "Source document is missing." };
  const currentSource = viewerSourceFromDocument({ identity: sourceEntry.expected });
  let targetAvailable = false, targetMatches = false;
  if (ref.kind === "document") {
    targetAvailable = !!project.workspace.entries.find(item => item.expected.id === ref.targetId);
    targetMatches = sourceEntry.expected.structuralHash === ref.targetHash;
  } else if (ref.kind === "result") {
    const result = project.workspace.results.find(item => item.resultId === ref.targetId);
    targetAvailable = !!result;
    targetMatches = !!result && structuralHash(result) === ref.targetHash &&
      matchesScientificSourceGeneration(result.provenance.source, ref.source);
  } else if (ref.kind === "study") {
    const study = project.workspace.studies?.find(item => item.id === ref.targetId);
    targetAvailable = !!study;
    targetMatches = !!study && structuralHash(study) === ref.targetHash &&
      inspectProjectStudyMembers(project, study).every(item => item.status === "current-reference");
  } else {
    targetAvailable = true;
    targetMatches = true; // A selection adapter must separately verify its targetHash and selectionId.
  }
  if (!targetAvailable) return { status: "missing", resourceStatus: "missing", reason: "Referenced target is missing." };
  const inventory = projectResourceInventory(project);
  const resources = ref.resources.map(pin => {
    const item = inventory.find(candidate => candidate.kind === pin.kind && candidate.id === pin.id &&
      candidate.owners.includes(ref.source.documentId));
    return item && structuralHash(item.reference) === pin.descriptorHash && item.checksum === pin.checksum ? item : null;
  });
  const missingResource = resources.some(item => !item) || !!readResource && resources.some(item => {
    if (!item) return true;
    try { const bytes = readResource(item); if (!bytes) return true; verifyProjectResourceBytes(item, bytes); return false; }
    catch { return true; }
  });
  const resourceStatus = missingResource ? "missing" : readResource ? "verified" : "not-checked";
  const current = targetMatches && matchesScientificSourceGeneration(ref.source, currentSource) && !missingResource;
  return { status: current ? "current" : "historical", resourceStatus,
    reason: missingResource ? "Pinned source resource is unavailable or changed." : !targetMatches ?
      "Referenced target changed." : current ? "Source generation and target identity match." : "Source generation changed." };
}
