import { useEffect, useMemo, useState } from "react";
import { sampleGraph2DScene, type Graph2DProbe, type Math3DProject, type StudyRecordV1 } from "@math3d/core";
import { Graph2DPlot } from "../graph2d/Graph2DPlot";
import { GeometryViewer } from "./GeometryViewer";
import { additionalRepresentationView } from "../projects/additionalProjectRepresentations";
import type { VerifiedProjectResources } from "../projects/projectResources";
import { resolveStudyPane } from "../projects/studyPaneResolution";
import { qualifyStudyGraphCurveLink, studyHasQualifiedGraphCurveLink } from "../projects/studyGraphCurveLink";
import { projectCurveParameterToGraph } from "../graph2d/graphCurveCursor";
import { scientificCursorBus } from "./scientificCursor";

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
    const resolved = resolveStudyPane(project, study, paneId);
    if (resolved.status !== "ready") return { kind: "withheld" as const, reason: resolved.reason };
    const document = resolved.document;
    try {
      if (document.format === "math3d.graph2d-document") {
        const series = sampleGraph2DScene({ document, viewport: document.display.viewport,
          ...plotSize, interaction: false, timeBudgetMs: 120 });
        return { kind: "graph" as const, display: document.display, series };
      }
      if (["math3d.curve-document", "math3d.surface-document", "math3d.geometry-document",
        "math3d.topology-document"].includes(document.format)) {
        const view = additionalRepresentationView(document as Parameters<typeof additionalRepresentationView>[0],
          { documents: resolved.documents, resources, project });
        return { kind: "geometry" as const, view };
      }
      return { kind: "withheld" as const,
        reason: "This document has no read-only Study pane viewer yet. Open its owning document." };
    } catch (error) { return { kind: "withheld" as const,
      reason: `Saved preview unavailable: ${(error as Error).message}` }; }
  }, [project, study, paneId, resources]);
  if (preview.kind === "withheld") return <p role="status" data-testid="project-study-preview-withheld">{preview.reason}</p>;
  return <div data-testid="project-study-pane-preview" data-kind={preview.kind}
    style={{ position: "relative", height: 320, minWidth: 0, overflow: "hidden" }}>
    {preview.kind === "graph" ? <Graph2DPlot display={preview.display} size={plotSize} series={preview.series}
      linkedCursorProbe={linkedProbe} /> :
      <GeometryViewer scene={preview.view.scene} meshOverrides={preview.view.meshes} />}
  </div>;
}
