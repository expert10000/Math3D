import { adoptMixedWorkspaceProject, replaceMath3DProjectWorkspace,
  type Math3DProject, type MixedWorkspaceDocument } from "@math3d/core";
import { mergeProjectLiveWorkspace } from "./projectTransfer";

/** Keep the current Project owner when its live workspace contains owned Studies or Notes. */
export function projectOpenBackup(workspace: MixedWorkspaceDocument, current?: Math3DProject | null) {
  return current ? replaceMath3DProjectWorkspace(current,
    mergeProjectLiveWorkspace(current.workspace, workspace)) :
    adoptMixedWorkspaceProject(workspace, "Before project open");
}
