import { createMath3DProject, createMixedWorkspaceDocument, instantiateMath3DProjectTemplate, updateMath3DProjectMetadata } from "@math3d/core";
import { meshResourceFixture, scalarVolumeResourceFixture, pointResourceFixture } from "./meshResources";
import { acceptanceComplexDocument } from "./complexSource";
import { parseProjectPackage, exportProjectPackage, VerifiedProjectResources } from "../../../renderer/src/projects/projectResources";
import { verifyMixedWorkspaceReplay } from "../../../renderer/src/kernel/mixedWorkspaceReplay";

/** Real built-in recipes plus checked Mesh, scalar Volume and Graph table resources. */
export const projectFreezeFixture = () => {
  const templates = ["spline-surface-lab", "scene-topology-study", "curve-construction-study"].map((id) => instantiateMath3DProjectTemplate(id, `prj18-freeze/${id}`));
  const sources = [pointResourceFixture(), meshResourceFixture(), scalarVolumeResourceFixture()];
  const complex = acceptanceComplexDocument("1/z");
  const entries = [...sources.flatMap((source) => source.project.workspace.entries), ...templates.flatMap((project) => project.workspace.entries),
    { module: "complex" as const, checkpoint: complex, expected: complex.identity, replay: null }];
  const workspace = createMixedWorkspaceDocument({ entries, activeDocumentIds: entries.map((entry) => entry.expected.id),
    constructions: [], committedSelection: null, artifacts: [], relations: templates.flatMap((project) => project.workspace.relations),
    results: sources.flatMap((source) => source.project.workspace.results) });
  let project = createMath3DProject(workspace, { title: "Cross-module acceptance study", stableKey: "prj18-freeze-v1" });
  project = updateMath3DProjectMetadata(project, { ...project.metadata, tags: ["acceptance", "prj18", "presets"],
    description: "Eight modules, original source bytes and historical analysis. Desktop/web editing; mobile support is qualified separately.",
    documents: Object.fromEntries(entries.map((entry) => {
      const document = entry.checkpoint as any;
      return [entry.expected.id, { title: document.metadata?.title ?? document.metadata?.label ?? (entry.module === "complex" ? "Exact residue source" : document.source?.model?.name ?? entry.module) }];
    })) });
  const resources = new VerifiedProjectResources(project, sources.flatMap((source) => parseProjectPackage(source.raw).resources.sidecars()));
  const docs = [...verifyMixedWorkspaceReplay(workspace).values()];
  return { project, raw: exportProjectPackage(project, resources), docs,
    mobile: instantiateMath3DProjectTemplate("catenary-study", "prj18-mobile-freeze"),
    targets: {
      curve: docs.find((document: any) => document.metadata?.title === "Weighted spline curve")!.identity.id,
      surface: docs.find((document: any) => document.metadata?.title === "Implicit unit sphere")!.identity.id,
      geometry: docs.find((document) => document.format === "math3d.geometry-document")!.identity.id,
      topology: docs.find((document: any) => document.source?.kind === "simplicial-complex")!.identity.id,
      mesh: sources[1]!.project.workspace.entries[0]!.expected.id,
      volume: sources[2]!.project.workspace.entries[0]!.expected.id,
      complex: complex.identity.id,
    } };
};

export const inspectFreezePackage = (raw: string) => {
  const { project, resources } = parseProjectPackage(raw);
  const docs = [...verifyMixedWorkspaceReplay(project.workspace).values()];
  return { project, docs, resources: resources.sidecars() };
};
