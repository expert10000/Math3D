import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Math3DProject, ProjectCompositionMember } from "@math3d/core";
import type { ProjectResourceReader } from "../projects/projectResources";
import { verifySavedMeshResult } from "../projects/projectSavedMeshResultComparison";
import { ComparisonPane, resolveProjectCompositionMember } from "./ProjectCompositionView";

/** PC16 read-only view of the exact Mesh generation behind a stored result. */
export function ProjectSavedMeshGenerationPreview({ project, resultId, readResource, onClose }: {
  project: Math3DProject; resultId: string; readResource: ProjectResourceReader; onClose: () => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const resolved = useMemo(() => {
    try {
      const checked = verifySavedMeshResult(project, resultId, readResource);
      const member: ProjectCompositionMember = { documentId: checked.source.identity.id,
        expected: checked.source.identity, visible: true, color: "#3976d7", opacity: 1 };
      return { checked, render: resolveProjectCompositionMember(project, member, readResource), error: null };
    } catch (error) { return { checked: null, render: null, error: (error as Error).message }; }
  }, [project, resultId, readResource]);
  return createPortal(<div className="project-gallery-preview-backdrop" data-testid="project-mesh-generation-preview" style={{ zIndex: 10001 }}>
    <div className="project-gallery-preview-sheet" role="dialog" aria-modal="true" aria-label="Exact saved Mesh generation" style={{ width: "min(96vw,1000px)", maxWidth: 1000, maxHeight: "90vh", overflow: "auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><h2>Exact saved Mesh generation</h2>
        <p>Read-only source for result {resultId}. No Mesh analysis runs here.</p></div><button type="button" onClick={onClose}>Return to saved result</button></header>
      {resolved.error && <p role="alert">Generation unavailable: {resolved.error}</p>}
      {resolved.checked && resolved.render && <>
        <p data-testid="project-mesh-generation-identity">Mesh {resolved.checked.source.identity.id} · r{resolved.checked.source.identity.revision} · {resolved.checked.generation}<br />
          Source hash {resolved.checked.source.identity.structuralHash}<br />Result hash {resolved.checked.resultHash}</p>
        <ComparisonPane members={[resolved.render]} label="Verified saved Mesh source" height={480} onPick={value => setPick(`Face ${value.faceIndex ?? "—"} · ${value.point.x.toPrecision(5)}, ${value.point.y.toPrecision(5)}, ${value.point.z.toPrecision(5)}`)} />
        <p>Selection belongs only to this saved generation. Vertex and face IDs are not aligned with other revisions.</p>
        {pick && <p data-testid="project-mesh-generation-pick">{pick}</p>}
      </>}
    </div>
  </div>, document.body);
}
