import { listProjectScientificSelections, normalizeAdapterFrame,
  referenceFromScientificSelection, viewerSourceFromDocument,
  type AdapterFrame, type Math3DProject, type ValidationResult } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import type { ProjectCursorDraft } from "./scientificCursor";

/** Existing Project selections own the saved identity; the cursor is a transient view of it. */
export function projectCursorFromSavedPoint(project: Math3DProject, selectionId: string,
  frame: AdapterFrame, originViewId: string, mode: ProjectCursorDraft["mode"] = "locked"
): ValidationResult<ProjectCursorDraft> {
  const normalizedFrame = normalizeAdapterFrame(frame);
  if (!normalizedFrame.ok) return { ok: false, errors: normalizedFrame.errors };
  const resolved = verifyMixedWorkspaceReplay(project.workspace);
  const selection = listProjectScientificSelections(project, resolved).find(item =>
    item.identity.kind === "authored" && item.identity.id === selectionId);
  if (!selection || selection.geometry.kind !== "point")
    return { ok: false, errors: ["Project cursor requires a saved point selection."] };
  if (selection.source?.kind !== "document")
    return { ok: false, errors: ["Project cursor requires a pinned Project document source."] };
  const documentId = selection.source.documentId;
  const entry = project.workspace.entries.find(item => item.expected.id === documentId);
  const document = resolved.get(documentId);
  if (!entry || !document)
    return { ok: false, errors: ["Saved cursor source document is unavailable."] };
  const currentSource = viewerSourceFromDocument(document);
  const reference = referenceFromScientificSelection(selection, currentSource, entry.module,
    normalizedFrame.value, "point");
  if (!reference.ok) return { ok: false, errors: reference.errors };
  const resourceSha256 = document.format === "math3d.mesh-document" ?
    document.source.resource.checksum.slice("sha256:".length) : reference.value.resourceSha256;
  return { ok: true, value: { source: reference.value.source, sourceModule: entry.module,
    frame: reference.value.frame, position: [...selection.geometry.position],
    resourceSha256, originViewId, mode } };
}
