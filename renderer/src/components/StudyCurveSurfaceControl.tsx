import { useState } from "react";
import type { Math3DProject } from "@math3d/core";
import { curveSurfaceCursorDraft, curveSurfaceReturnDraft, projectCurveSurfaceParameter } from
  "../curveAnalysis/curveSurfaceCursor";
import type { QualifiedStudyCurveSurface } from "../projects/studyCurveSurfaceLink";
import { scientificCursorBus } from "./scientificCursor";

/** The Study stores the mapping declaration, while the current parameter stays on the shared bus. */
export function StudyCurveSurfaceControl({ project, pair, studyId }: {
  project: Math3DProject; pair: QualifiedStudyCurveSurface; studyId: string;
}) {
  const [parameter, setParameter] = useState("");
  const [u, setU] = useState("");
  const [v, setV] = useState("");
  const [message, setMessage] = useState("");
  const share = (draft: ReturnType<typeof curveSurfaceCursorDraft>) => {
    if (draft.status !== "matched") { setMessage(draft.reason); return; }
    const cursor = scientificCursorBus.publishProject(draft.value, draft.value.source);
    const chart = projectCurveSurfaceParameter(cursor, project, pair.surface.identity.id);
    if (chart.status !== "matched") { setMessage(chart.reason); return; }
    setParameter(String(cursor.position[0]));
    setU(String(chart.value.u)); setV(String(chart.value.v));
    setMessage(`Curve ${pair.curve.source.domain.parameter}=${cursor.position[0]} maps to Surface chart ` +
      `(u=${chart.value.u}, v=${chart.value.v}); no Mesh element is inferred.`);
  };
  return <div data-testid="project-study-curve-surface-control">
    <label>Curve parameter ({pair.curve.source.domain.parameter}) <input type="number" value={parameter}
      min={pair.curve.source.domain.min} max={pair.curve.source.domain.max}
      onChange={event => setParameter(event.target.value)} /></label>
    <button type="button" data-testid="project-study-share-chart-parameter" onClick={() => {
      const t = parameter.trim() === "" ? NaN : Number(parameter);
      share(curveSurfaceCursorDraft(project, pair.curve.identity.id, pair.surface.identity.id, t, `study:${studyId}`));
    }}>Share Curve parameter with Surface</button>
    <label>Surface u <input type="number" value={u} onChange={event => setU(event.target.value)} /></label>
    <label>Surface v <input type="number" value={v} onChange={event => setV(event.target.value)} /></label>
    <button type="button" data-testid="project-study-return-chart-point" onClick={() => {
      const uv = { u: u.trim() === "" ? NaN : Number(u), v: v.trim() === "" ? NaN : Number(v) };
      share(curveSurfaceReturnDraft(project, pair.curve.identity.id,
        { surfaceId: pair.surface.identity.id, revision: pair.surface.identity.revision,
          hash: pair.surface.identity.structuralHash, uv }, `study:${studyId}`));
    }}>Return chart point to Curve</button>
    {message && <p role="status" data-testid="project-study-chart-result">{message}</p>}
  </div>;
}
