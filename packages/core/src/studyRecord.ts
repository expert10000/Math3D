import { canonicalJsonStringify, createStableDocumentId, isDocumentIdentity, isStableDocumentId,
  type CanonicalJsonValue, type DocumentIdentity, type StableDocumentId } from "./documentIdentity";
import type { ValidationResult } from "./validation";
import { normalizeResearchReference, type ResearchReference } from "./researchReferenceSchema";

export const STUDY_RECORD_FORMAT = "math3d.study/v1" as const;
export const MAX_STUDY_RECORD_BYTES = 24 * 1024;
export type StudyMember = Readonly<{ memberId: string; documentId: StableDocumentId;
  expected: DocumentIdentity; role: "source" | "derived" | "analysis" | "visual"; resultId?: string }>;
export type StudyPane = Readonly<{ paneId: string; memberId: string; viewConfigId?: string }>;
export type StudyLink = Readonly<{ id: string; kind: "cursor" | "parameter" | "time" | "camera";
  sourcePaneId: string; targetPaneId: string; mappingId: string; direction: "one-way" | "two-way" }>;
/** A Project-owned assembly of references. Participating documents keep their own ownership. */
export type StudyRecordV1 = Readonly<{
  format: typeof STUDY_RECORD_FORMAT; schemaVersion: 1; id: StableDocumentId; projectId: StableDocumentId;
  title: string; description?: string; members: readonly StudyMember[];
  layout: Readonly<{ mode: "single" | "split-2" | "quad" | "tabs"; panes: readonly StudyPane[] }>;
  links: readonly StudyLink[]; pinnedSelectionIds: readonly string[];
  paneReferences?: readonly Readonly<{ paneId: string; reference: ResearchReference }>[];
  notesRefs?: readonly string[]; workbookRefs?: readonly string[];
}>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every(key => key in value) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const token = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;
const refs = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= max &&
  value.every(token) && unique(value);

export function normalizeStudyRecordV1(value: unknown): ValidationResult<StudyRecordV1> {
  try {
    if (!record(value) || !exact(value,
      ["format", "schemaVersion", "id", "projectId", "title", "members", "layout", "links", "pinnedSelectionIds"],
      ["description", "notesRefs", "workbookRefs", "paneReferences"]) || value.format !== STUDY_RECORD_FORMAT || value.schemaVersion !== 1 ||
        !isStableDocumentId(value.id) || !value.id.startsWith("math3d:study:") ||
        !isStableDocumentId(value.projectId) || !value.projectId.startsWith("math3d:project:") ||
        typeof value.title !== "string" || !value.title.trim() || value.title.trim() !== value.title || value.title.length > 160 ||
        value.description !== undefined && (typeof value.description !== "string" || value.description.length > 2000) ||
        !Array.isArray(value.members) || value.members.length < 1 || value.members.length > 8 ||
        !record(value.layout) || !exact(value.layout, ["mode", "panes"]) ||
        !["single", "split-2", "quad", "tabs"].includes(String(value.layout.mode)) ||
        !Array.isArray(value.layout.panes) || value.layout.panes.length < 1 || value.layout.panes.length > 4 ||
        !Array.isArray(value.links) || value.links.length > 12 ||
        !refs(value.pinnedSelectionIds, 32) ||
        value.notesRefs !== undefined && !refs(value.notesRefs, 32) ||
        value.workbookRefs !== undefined && !refs(value.workbookRefs, 32))
      return { ok: false, errors: ["Invalid Study record envelope or collection bounds."] };
    const members = value.members as unknown[], panes = value.layout.panes as unknown[], links = value.links as unknown[];
    if (members.some(member => !record(member) || !exact(member, ["memberId", "documentId", "expected", "role"], ["resultId"]) ||
        !token(member.memberId) || !isStableDocumentId(member.documentId) || !isDocumentIdentity(member.expected) ||
        member.expected.id !== member.documentId || !["source", "derived", "analysis", "visual"].includes(String(member.role)) ||
        member.resultId !== undefined && !token(member.resultId)) ||
        !unique(members.map(member => (member as StudyMember).memberId)))
      return { ok: false, errors: ["Invalid or duplicate Study member."] };
    if (panes.some(pane => !record(pane) || !exact(pane, ["paneId", "memberId"], ["viewConfigId"]) ||
        !token(pane.paneId) || !token(pane.memberId) ||
        pane.viewConfigId !== undefined && !token(pane.viewConfigId) ||
        !members.some(member => (member as StudyMember).memberId === pane.memberId)) ||
        !unique(panes.map(pane => (pane as StudyPane).paneId)) ||
        value.layout.mode === "single" && panes.length !== 1 ||
        value.layout.mode === "split-2" && panes.length !== 2 ||
        value.layout.mode === "quad" && panes.length !== 4)
      return { ok: false, errors: ["Invalid Study layout or pane reference."] };
    const paneIds = new Set(panes.map(pane => (pane as StudyPane).paneId));
    if (value.paneReferences !== undefined && (!Array.isArray(value.paneReferences) ||
      value.paneReferences.length !== panes.length ||
      new Set(value.paneReferences.map((item: { paneId: string }) => item.paneId)).size !== value.paneReferences.length ||
      value.paneReferences.some((item: unknown) => {
        if (!record(item) || !exact(item, ["paneId", "reference"]) || !paneIds.has(item.paneId as string)) return true;
        const pane = panes.find(candidate => (candidate as StudyPane).paneId === item.paneId) as StudyPane | undefined;
        const member = members.find(candidate => (candidate as StudyMember).memberId === pane?.memberId) as StudyMember | undefined;
        const reference = normalizeResearchReference(item.reference);
        return !member || !reference || reference.kind !== "document" || reference.projectId !== value.projectId ||
          reference.targetId !== member.documentId || reference.source.documentId !== member.documentId;
      }))) return { ok: false, errors: ["Invalid Study pane research references."] };
    if (links.some(link => !record(link) || !exact(link,
      ["id", "kind", "sourcePaneId", "targetPaneId", "mappingId", "direction"]) ||
        !token(link.id) || !["cursor", "parameter", "time", "camera"].includes(String(link.kind)) ||
        !token(link.sourcePaneId) || !token(link.targetPaneId) ||
        !paneIds.has(link.sourcePaneId) || !paneIds.has(link.targetPaneId) ||
        link.sourcePaneId === link.targetPaneId || !token(link.mappingId) ||
        !["one-way", "two-way"].includes(String(link.direction))) ||
        !unique(links.map(link => (link as StudyLink).id)))
      return { ok: false, errors: ["Invalid Study link or pane endpoint."] };
    const text = canonicalJsonStringify(value);
    if (new TextEncoder().encode(text).byteLength > MAX_STUDY_RECORD_BYTES)
      return { ok: false, errors: ["Study record exceeds its compact size limit."] };
    return { ok: true, value: JSON.parse(text) as StudyRecordV1 };
  } catch (error) { return { ok: false, errors: [(error as Error).message] }; }
}

export function createStudyRecordV1(projectId: StableDocumentId, stableKey: CanonicalJsonValue,
  input: Omit<StudyRecordV1, "format" | "schemaVersion" | "id" | "projectId">): StudyRecordV1 {
  const candidate = { ...input, format: STUDY_RECORD_FORMAT, schemaVersion: 1,
    id: createStableDocumentId("study", { projectId, stableKey }), projectId };
  const checked = normalizeStudyRecordV1(candidate);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}
