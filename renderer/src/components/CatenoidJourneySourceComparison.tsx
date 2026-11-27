import { useMemo } from "react";
import type { Math3DProject, ProjectCompositionMember } from "@math3d/core";
import type { VerifiedProjectResources } from "../projects/projectResources";
import { ComparisonPane, resolveProjectCompositionMember } from "./ProjectCompositionView";

/** Show the exact saved sources used by the ridge publication step. */
export function CatenoidJourneySourceComparison({ project, resources }: {
  project: Math3DProject; resources?: VerifiedProjectResources;
}) {
  const source = useMemo(() => {
    const entries = project.workspace.entries;
    for (const relation of project.workspace.relations) {
      if (relation.operation !== "surface.tessellate-saved" || relation.status !== "current" ||
          relation.sources.length !== 1 || relation.target.type !== "document") continue;
      const generation = relation.sources[0]!;
      const surface = entries.find(entry => entry.module === "surface" && entry.expected.id === generation.documentId &&
        entry.expected.revision === generation.revision && entry.expected.structuralHash === generation.structuralHash);
      const mesh = entries.find(entry => entry.module === "mesh" && relation.target.type === "document" &&
        entry.expected.id === relation.target.generation.documentId &&
        entry.expected.revision === relation.target.generation.revision &&
        entry.expected.structuralHash === relation.target.generation.structuralHash);
      if (surface && mesh) return { surface, mesh };
    }
    return null;
  }, [project]);
  const preview = useMemo(() => {
    if (!source) return { error: "Generate a saved Mesh from the current Surface to inspect the pair." };
    const member = (entry: typeof source.surface, color: string): ProjectCompositionMember => ({
      documentId: entry.expected.id, expected: entry.expected, visible: true, color, opacity: 1,
    });
    try {
      const read = (item: Parameters<VerifiedProjectResources["bytes"]>[0]) => resources?.bytes(item) ?? null;
      return {
        surface: resolveProjectCompositionMember(project, member(source.surface, "#3976d7"), read),
        mesh: resolveProjectCompositionMember(project, member(source.mesh, "#e8793a"), read),
      };
    } catch (error) { return { error: `The saved pair cannot be shown: ${(error as Error).message}` }; }
  }, [project, resources, source]);
  if (preview.error || !preview.surface || !preview.mesh) return <p role="status" data-testid="catenoid-comparison-preview-status">{preview.error}</p>;
  return <section data-testid="catenoid-comparison-sources" aria-label="Surface and Mesh sources">
    <h5>Inspect the Surface and retained Mesh</h5>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 12 }}>
      <ComparisonPane members={[preview.surface]} label={`Surface · ${preview.surface.title}`} onPick={() => {}} height={340} />
      <ComparisonPane members={[preview.mesh]} label={`Mesh · ${preview.mesh.title}`} onPick={() => {}} height={340} />
    </div>
    <p>These are read-only views of the exact saved generations. Publish below to record the curvature comparison.</p>
  </section>;
}
