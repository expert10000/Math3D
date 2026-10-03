import { captureProjectResources, createMath3DProject, createMixedWorkspaceDocument, exportProjectPackage,
  instantiateMath3DProjectTemplate, updateMath3DProjectMetadata } from "@math3d/core";
import { projectFreezeFixture } from "./projectFreeze";
import { parseProjectPackage } from "../../../renderer/src/projects/projectResources";
import { verifyMixedWorkspaceReplay } from "../../../renderer/src/kernel/mixedWorkspaceReplay";

/** Public checkpoint package with all eight modules, two Graphs and real source bytes. */
export const mobileMixedProjectFixture = () => {
  const frozen = projectFreezeFixture(), original = parseProjectPackage(frozen.raw);
  const resolved = verifyMixedWorkspaceReplay(frozen.project.workspace);
  const second = instantiateMath3DProjectTemplate("derivative-study", "prj22-24-second-graph");
  const entries = [...frozen.project.workspace.entries.map(entry => ({ ...entry, checkpoint: resolved.get(entry.expected.id)!, replay: null })), ...second.workspace.entries];
  let project = createMath3DProject(createMixedWorkspaceDocument({ ...frozen.project.workspace, entries,
    results: [...frozen.project.workspace.results, ...second.workspace.results], relations: [...frozen.project.workspace.relations, ...second.workspace.relations],
    constructions: [{ kind: "scene-script", source: "box = box(2, 3, 4)", normalizedSceneScript: "box = box(2, 3, 4)" }],
    activeDocumentIds: entries.map(entry => entry.expected.id) }), { title: "PRJ24 Mixed Resource Study", stableKey: "prj22-24-mobile-resource-acceptance-v1" });
  project = updateMath3DProjectMetadata(project, { ...project.metadata, tags: ["acceptance", "prj24"],
    documents: { ...frozen.project.metadata.documents, ...second.metadata.documents,
      [entries.find(entry => entry.module === "geometry")!.expected.id]: { title: "Retained scene constructions" } } });
  const resources = captureProjectResources(project, item => original.resources.bytes(item));
  return { project, resources, raw: exportProjectPackage(project, resources),
    graphIds: entries.filter(entry => entry.module === "graph2d").map(entry => entry.expected.id) };
};
