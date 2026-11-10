import { createProjectStudyFromDocuments, upsertProjectStudy,
  updateMath3DProjectMetadata, type Math3DProject } from "@math3d/core";
import type { CuratedStarterId } from "./curatedStudyCatalog";

const layouts: Partial<Record<CuratedStarterId, Readonly<{
  title: string; modules: readonly ("graph2d" | "curve" | "surface" | "geometry" | "topology" | "mesh")[];
  resultOnModule?: "graph2d" | "mesh";
}>>> = {
  "catenary-study": { title: "Catenary, catenoid and derivative", modules: ["graph2d", "surface"], resultOnModule: "graph2d" },
  "derivative-study": { title: "Parabola, Curve and derivative", modules: ["graph2d", "curve"], resultOnModule: "graph2d" },
  "catenoid-evidence": { title: "Catenoid and recorded Mesh curvature", modules: ["surface", "mesh"], resultOnModule: "mesh" },
  "scene-topology-study": { title: "Geometry constructions and incidence", modules: ["geometry", "topology"] },
  "geometry-note-pins": { title: "Geometry and anchored observations", modules: ["geometry"] },
  "graph-derivative-notebook": { title: "Graph and Curve with recorded evidence", modules: ["graph2d", "curve"], resultOnModule: "graph2d" },
  "ripple-wave-study": { title: "Wave profile and constructed representations", modules: ["graph2d", "surface", "geometry"] },
  "surface-geometry-probe": { title: "Source-backed Surface and Geometry", modules: ["surface", "geometry"] },
};

/** Add a saved reference layout only for an explicitly chosen guided Gallery copy. */
export function prepareCuratedStudyProject(project: Math3DProject, id: CuratedStarterId,
  instanceKey: string): Math3DProject {
  const layout = layouts[id];
  if (!layout) return project;
  if (!project.metadata.tags?.includes(id)) throw new TypeError("Guided Study starter identity does not match the Project.");
  if (project.workspace.studies?.length) throw new TypeError("Guided Study starter already has a saved layout.");
  const entries = layout.modules.map(module => project.workspace.entries.find(entry => entry.module === module));
  if (entries.some(entry => !entry)) throw new TypeError(`Guided Study ${id} lacks a required source document.`);
  let next = createProjectStudyFromDocuments(project, ["curated-study", id, instanceKey], layout.title,
    entries.map(entry => entry!.expected.id));
  if (layout.resultOnModule) {
    const first = next.workspace.studies![0]!;
    const member = first.members.find(item => project.workspace.entries.find(entry =>
      entry.expected.id === item.documentId)?.module === layout.resultOnModule);
    const result = next.workspace.results.find(item => item.provenance.source.documentId === member?.documentId);
    if (!member || !result) throw new TypeError(`Guided Study ${id} lacks its recorded source result.`);
    next = upsertProjectStudy(next, { ...first, members: first.members.map(item => item.memberId === member.memberId ?
      { ...item, resultId: result.resultId } : item) });
  }
  return updateMath3DProjectMetadata(next, { ...next.metadata,
    tags: [...new Set([...(next.metadata.tags ?? []), "curated-study-v1"])],
  });
}

export const curatedStudyHasLayout = (id: CuratedStarterId): boolean => !!layouts[id];
