import { useEffect, useMemo, useState } from "react";
import { qualifyProjectQwzQuadStudy, sampleGraph2DScene,
  type Graph2DProbe, type Math3DProject, type StudyRecordV1 } from "@math3d/core";
import { Graph2DPlot } from "../graph2d/Graph2DPlot";
import { GeometryViewer } from "./GeometryViewer";
import { additionalRepresentationView } from "../projects/additionalProjectRepresentations";
import type { VerifiedProjectResources } from "../projects/projectResources";
import { resolveStudyPane } from "../projects/studyPaneResolution";
import { qualifyStudyGraphCurveLink, studyHasQualifiedGraphCurveLink } from "../projects/studyGraphCurveLink";
import { projectCurveParameterToGraph } from "../graph2d/graphCurveCursor";
import { scientificCursorBus } from "./scientificCursor";
import { StudyQuantumPanePreview } from "./StudyQuantumPanePreview";
import { StudyVectorFieldPanePreview } from "./StudyVectorFieldPanePreview";

const plotSize = { width: 360, height: 280 };

/** Mounted only for the pane the user opens. Source ownership stays in the Project. */
export function StudyPanePreview({ project, study, paneId, resources }: {
  project: Math3DProject; study: StudyRecordV1; paneId: string; resources?: VerifiedProjectResources;
}) {
  const [linkedProbe, setLinkedProbe] = useState<Graph2DProbe | null>(null);
  useEffect(() => {
    const pair = qualifyStudyGraphCurveLink(project, study);
    if (!pair || pair.graphPaneId !== paneId || !studyHasQualifiedGraphCurveLink(study, pair)) {
      setLinkedProbe(null); return;
    }
    return scientificCursorBus.subscribe(cursor => {
      if (cursor.kind !== "project") { setLinkedProbe(null); return; }
      const projected = projectCurveParameterToGraph(cursor, project, pair.graphId, pair.objectId);
      setLinkedProbe(projected.status === "matched" ? projected.value : null);
    });
  }, [project, study, paneId]);
  const preview = useMemo(() => {
    const resolved = resolveStudyPane(project, study, paneId, resources);
    if (resolved.status !== "ready") return { kind: "withheld" as const, reason: resolved.reason };
    const document = resolved.document;
    try {
      if (document.format === "math3d.graph2d-document") {
        const series = sampleGraph2DScene({ document, viewport: document.display.viewport,
          ...plotSize, interaction: false, timeBudgetMs: 120 });
        return { kind: "graph" as const, display: document.display, series };
      }
      if (document.format === "math3d.vector-field3d-document")
        return { kind: "field" as const, document };
      if (document.format === "math3d.volume-document") {
        const payload = document.source.payload;
        if (payload && !resources?.bytes({ kind: "volume-payload", id: payload.handle }))
          return { kind: "withheld" as const, reason: "Saved Volume payload is unavailable or unverified." };
        return { kind: "volume" as const, document };
      }
      if (document.format === "math3d.mesh-document") {
        if (!resources?.bytes({ kind: "mesh-buffers", id: document.source.resource.id }))
          return { kind: "withheld" as const, reason: "Saved Mesh sidecar is unavailable or unverified." };
        return { kind: "mesh" as const, document };
      }
      if (["math3d.curve-document", "math3d.surface-document", "math3d.geometry-document",
        "math3d.topology-document"].includes(document.format)) {
        const view = additionalRepresentationView(document as Parameters<typeof additionalRepresentationView>[0],
          { documents: resolved.documents, resources, project });
        return { kind: "geometry" as const, view };
      }
      const viewConfigId = study.layout.panes.find(item => item.paneId === paneId)?.viewConfigId;
      const qwzPair = qualifyProjectQwzQuadStudy(project, study);
      if (document.format === "math3d.quantum-scene-document" && qwzPair &&
          (viewConfigId === "qwz.curvature" || viewConfigId === "qwz.bands" ||
            viewConfigId === "qwz.reciprocal" || viewConfigId === "qwz.inspector"))
        return { kind: "quantum" as const, document,
          role: viewConfigId.slice(4) as "curvature" | "bands" | "reciprocal" | "inspector",
          linkedFingerprints: [qwzPair.curvature.source.sceneFingerprint,
            qwzPair.bands.source.sceneFingerprint] as const };
      return { kind: "withheld" as const,
        reason: "This document has no read-only Study pane viewer yet. Open its owning document." };
    } catch (error) { return { kind: "withheld" as const,
      reason: `Saved preview unavailable: ${(error as Error).message}` }; }
  }, [project, study, paneId, resources]);
  if (preview.kind === "withheld") return <p role="status" data-testid="project-study-preview-withheld">{preview.reason}</p>;
  return <div data-testid="project-study-pane-preview" data-kind={preview.kind}
    style={{ position: "relative", height: 320, minWidth: 0, overflow: "hidden" }}>
    {preview.kind === "volume" ? <div data-testid="project-study-volume-source" style={{ padding: 16 }}>
      <strong>{preview.document.metadata.title}</strong>
      <p>Saved Volume source · revision {preview.document.identity.revision}</p>
      <p>Grid {preview.document.source.spatial.dimensions.join(" × ")} · {preview.document.source.spatial.positionUnits} · {preview.document.source.spatial.valueUnits}</p>
      <p>Open the owning Volume document for slices and extraction controls.</p>
    </div> : preview.kind === "mesh" ? <div data-testid="project-study-mesh-source" style={{ padding: 16 }}>
      <strong>{preview.document.metadata.label}</strong>
      <p>Retained Mesh · revision {preview.document.identity.revision}</p>
      <p>Verified sidecar {preview.document.source.resource.id}</p>
      <p>Open the owning Mesh document for geometry and analysis.</p>
    </div> : preview.kind === "field" ? <StudyVectorFieldPanePreview
      key={`${preview.document.identity.id}:${preview.document.identity.revision}:${preview.document.identity.structuralHash}`}
      document={preview.document} /> :
      preview.kind === "graph" ? <Graph2DPlot display={preview.display} size={plotSize} series={preview.series}
      linkedCursorProbe={linkedProbe} /> : preview.kind === "geometry" ?
      <GeometryViewer scene={preview.view.scene} meshOverrides={preview.view.meshes} /> :
      <StudyQuantumPanePreview project={project} document={preview.document} role={preview.role}
        linkedFingerprints={preview.linkedFingerprints} />}
  </div>;
}
