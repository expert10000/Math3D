import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { projectTemporalFieldSourceStatus, type TemporalFieldSourceDocument,
  type VerifiedTemporalTransfers } from
  "./temporalFieldSourceDocument";

export function upsertProjectTemporalFieldSource(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, transfers?: VerifiedTemporalTransfers): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const status = projectTemporalFieldSourceStatus(current, temporal, transfers);
  if (status.status !== "current") throw new TypeError(`Temporal source withheld: ${status.reason}.`);
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace,
    timeSources: [...(current.workspace.timeSources ?? []).filter(item =>
      item.identity.id !== temporal.identity.id), temporal] }));
}
