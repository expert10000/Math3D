import {
  parseMath3DProject,
  replaceMath3DProjectWorkspace,
  type Math3DProject,
  type MixedWorkspaceDocument,
} from "@math3d/core";
import { mergeProjectLiveWorkspace } from "../projects/projectTransfer";

export type NotebookProjectContext = Readonly<{ project: Math3DProject; live: boolean }>;

/** Only a saved Project ID can back a durable Workbook reference. */
export function readNotebookProjectContext(
  active: Math3DProject | null,
  savedBytes: string | null,
  capture: () => MixedWorkspaceDocument,
): NotebookProjectContext | null {
  if (!savedBytes) return null;
  const saved = parseMath3DProject(savedBytes);
  if (!active || active.identity.id !== saved.identity.id) return { project: saved, live: false };
  const workspace = mergeProjectLiveWorkspace(saved.workspace, capture());
  return { project: replaceMath3DProjectWorkspace(saved, workspace), live: true };
}
