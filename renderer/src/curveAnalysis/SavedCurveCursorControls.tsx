import { useEffect, useState } from "react";
import type { CurveDocument } from "@math3d/core";
import { scientificCursorBus, type ProjectScientificCursor } from "../components/scientificCursor";
import { projectSavedCurveParameterCursor, savedCurveParameterCursorDraft } from "./curveCursor";

/** Shared controls for saved Curve documents in both Project workbenches. */
export function SavedCurveCursorControls({ document }: { document: CurveDocument }) {
  const [cursor, setCursor] = useState<ProjectScientificCursor | null>(null);
  const [parameter, setParameter] = useState("");
  const [error, setError] = useState("");
  useEffect(() => scientificCursorBus.subscribe(event => {
    const incoming = event.kind === "project" && event.sourceModule === "curve" &&
      event.source.documentId === document.identity.id ? event : null;
    setCursor(incoming);
    if (incoming) {
      const projection = projectSavedCurveParameterCursor(incoming, document);
      if (projection.status === "matched") setParameter(String(projection.value));
    }
  }), [document]);
  const linked = cursor ? projectSavedCurveParameterCursor(cursor, document) : null;
  const share = () => {
    const draft = savedCurveParameterCursorDraft(document, parameter.trim() ? Number(parameter) : NaN,
      `project-curve:${document.identity.id}`);
    if (!draft.ok) { setError(draft.errors.join(" ")); return; }
    try { scientificCursorBus.publishProject(draft.value, draft.value.source); setError(""); }
    catch (failure) { setError((failure as Error).message); }
  };
  return <div data-testid="project-curve-cursor-controls" style={{ padding: 10 }}>
    <label>Curve parameter <input data-testid="project-curve-parameter" type="number" step="any"
      min={document.source.domain.min} max={document.source.domain.max} value={parameter}
      onChange={event => setParameter(event.target.value)} /></label>
    <button type="button" data-testid="project-curve-share-parameter" onClick={share}>Share exact parameter</button>
    {linked && <p role="status" data-testid="project-curve-linked-cursor">{
      linked.status === "matched" ? `Linked Curve parameter t=${linked.value}` :
        `Linked Curve parameter withheld: ${linked.reason}`}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
