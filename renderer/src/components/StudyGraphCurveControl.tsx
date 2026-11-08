import { useState } from "react";
import type { Math3DProject } from "@math3d/core";
import { savedCurveParameterCursorDraft } from "../curveAnalysis/curveCursor";
import { projectCurveParameterToGraph } from "../graph2d/graphCurveCursor";
import { scientificCursorBus } from "./scientificCursor";
import type { QualifiedStudyGraphCurve } from "../projects/studyGraphCurveLink";

/** A shared parameter is transient; the Study stores only the qualified mapping. */
export function StudyGraphCurveControl({ project, pair, studyId }: {
  project: Math3DProject; pair: QualifiedStudyGraphCurve; studyId: string;
}) {
  const [parameter, setParameter] = useState("");
  const [message, setMessage] = useState("");
  return <div data-testid="project-study-graph-curve-control">
    <label>Curve parameter ({pair.curve.source.domain.parameter}) <input type="number" value={parameter}
      min={pair.curve.source.domain.min} max={pair.curve.source.domain.max}
      onChange={event => setParameter(event.target.value)} /></label>
    <button type="button" data-testid="project-study-share-parameter" onClick={() => {
      const t = parameter.trim() === "" ? NaN : Number(parameter);
      const draft = savedCurveParameterCursorDraft(pair.curve, t, `study:${studyId}`);
      if (!draft.ok) { setMessage(draft.errors.join(" ")); return; }
      const cursor = scientificCursorBus.publishProject(draft.value, draft.value.source);
      const projected = projectCurveParameterToGraph(cursor, project, pair.graphId, pair.objectId);
      setMessage(projected.status === "matched" ?
        `Curve ${pair.curve.source.domain.parameter}=${t} maps to Graph (${projected.value.x}, ${projected.value.y}).` :
        projected.reason);
    }}>Share parameter</button>
    {message && <p role="status" data-testid="project-study-linked-result">{message}</p>}
  </div>;
}
