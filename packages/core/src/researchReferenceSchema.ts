import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { isScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";
import type { ProjectResourceKind } from "./projectResources";

export const RESEARCH_REFERENCE_FORMAT = "math3d.research-reference/v1" as const;
export type ResearchResourcePin = Readonly<{ kind: ProjectResourceKind; id: string;
  descriptorHash: StructuralHash; checksum: string | null }>;
export type ResearchReference = Readonly<{
  format: typeof RESEARCH_REFERENCE_FORMAT; schemaVersion: 1;
  projectId: StableDocumentId; kind: "document" | "result" | "study" | "selection";
  targetId: string; source: ScientificSourceGeneration; targetHash: StructuralHash;
  selectionId?: string; resources: readonly ResearchResourcePin[];
  pinState?: "legacy-unpinned";
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const token = (value: unknown): value is string => typeof value === "string" &&
  value.length > 0 && value.length <= 256 && value.trim() === value;
const resourceKinds = new Set<ProjectResourceKind>(["mesh-buffers", "graph-point-table", "volume-payload", "workbook-payload", "scientific-manifest", "scientific-component"]);

export function normalizeResearchReference(value: unknown): ResearchReference | null {
  if (!record(value) || Object.keys(value).sort().join("|") !==
    ["format", "schemaVersion", "projectId", "kind", "targetId", "source", "targetHash", "resources",
      ...(value.selectionId === undefined ? [] : ["selectionId"]),
      ...(value.pinState === undefined ? [] : ["pinState"])].sort().join("|") ||
    value.format !== RESEARCH_REFERENCE_FORMAT || value.schemaVersion !== 1 ||
    !isStableDocumentId(value.projectId) || !value.projectId.startsWith("math3d:project:") ||
    !["document", "result", "study", "selection"].includes(String(value.kind)) ||
    !token(value.targetId) || !isScientificSourceGeneration(value.source) ||
    !isStructuralHash(value.targetHash) || !Array.isArray(value.resources) || value.resources.length > 32 ||
    (value.kind === "document" && value.targetId !== value.source.documentId) ||
    (value.kind === "selection" ? !token(value.selectionId) : "selectionId" in value) ||
    (value.pinState !== undefined && (value.pinState !== "legacy-unpinned" || value.resources.length !== 0))) return null;
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
