import { isDocumentIdentity, type DocumentIdentity } from "./documentIdentity";
import type { MixedWorkspaceDocument } from "./mixedWorkspace";

/** A view of existing Project documents. No source bytes or edited document state live here. */
export type ProjectCompositionMember = Readonly<{
  documentId: string;
  expected: DocumentIdentity;
  visible: boolean;
  color: string;
  opacity: number;
}>;

export type ProjectComposition = Readonly<{
  id: string;
  title: string;
  mode: "overlay" | "side-by-side";
  members: readonly [ProjectCompositionMember, ProjectCompositionMember];
  /** User assertion, not metadata inferred from a scientific source. Required for overlay. */
  alignment?: Readonly<{ frame: string; unit: string }>;
}>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === keys.sort().join("|");
const label = (value: unknown, max: number) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max;

export const validProjectComposition = (value: unknown): value is ProjectComposition => {
  if (!record(value) || !exact(value, ["id", "title", "mode", "members", ...(value.alignment === undefined ? [] : ["alignment"])]) ||
    !label(value.id, 120) || !label(value.title, 160) || !["overlay", "side-by-side"].includes(String(value.mode)) ||
    !Array.isArray(value.members) || value.members.length !== 2 || value.members[0]?.documentId === value.members[1]?.documentId) return false;
  if (!value.members.every((member: unknown) => record(member) && exact(member, ["documentId", "expected", "visible", "color", "opacity"]) &&
    label(member.documentId, 160) && isDocumentIdentity(member.expected) && member.expected.id === member.documentId &&
    typeof member.visible === "boolean" && typeof member.color === "string" && /^#[a-fA-F0-9]{6}$/.test(member.color) &&
    typeof member.opacity === "number" && Number.isFinite(member.opacity) && member.opacity >= 0 && member.opacity <= 1)) return false;
  if (value.mode === "overlay") return record(value.alignment) && exact(value.alignment, ["frame", "unit"]) &&
    label(value.alignment.frame, 80) && label(value.alignment.unit, 40);
  return value.alignment === undefined;
};

export type ProjectCompositionMemberStatus = "current" | "historical" | "missing";
export const inspectProjectComposition = (composition: ProjectComposition, workspace: MixedWorkspaceDocument): readonly ProjectCompositionMemberStatus[] =>
  composition.members.map(member => {
    const entry = workspace.entries.find(item => item.expected.id === member.documentId);
    if (!entry) return "missing";
    return entry.expected.revision === member.expected.revision && entry.expected.structuralHash === member.expected.structuralHash ? "current" : "historical";
  });
