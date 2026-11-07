import { useEffect, useMemo, useState } from "react";
import { listProjectScientificSelections, matchesScientificSourceGeneration,
  viewerSourceFromDocument, type AdapterFrame, type Math3DProject,
  type ScientificSelection } from "@math3d/core";
import { projectCursorFromSavedPoint } from "./projectCursorAdapter";
import { scientificCursorBus, type ProjectScientificCursor } from "./scientificCursor";

/** First declared Project frame: Vector Field 3D Cartesian positions in metres. */
export const VECTOR3D_CURSOR_FRAME: AdapterFrame = {
  kind: "cartesian", frameId: "field-meters", axes: [
    { name: "x", dimension: "length", unit: "m" },
    { name: "y", dimension: "length", unit: "m" },
    { name: "z", dimension: "length", unit: "m" },
  ],
};

export function vectorPointCursorAvailability(project: Math3DProject, selection: ScientificSelection): string | null {
  if (selection.identity.kind !== "authored" || selection.geometry.kind !== "point") return "Point selection required.";
  if (selection.source?.kind !== "document" || !selection.source.checkpoint) return "Source checkpoint is not pinned.";
  const documentId = selection.source.documentId;
  const entry = project.workspace.entries.find(item => item.expected.id === documentId);
  if (!entry || entry.module !== "vector3d") return "Only Vector Field 3D points are supported here.";
  if (selection.frame.kind !== "cartesian" || selection.frame.axes.length !== 3 ||
      selection.frame.axes.some((axis, index) => axis.name !== VECTOR3D_CURSOR_FRAME.axes[index]?.name ||
        axis.unit !== VECTOR3D_CURSOR_FRAME.axes[index]?.unit))
    return "Point frame must declare x, y, z in metres.";
  const source = viewerSourceFromDocument(entry.checkpoint);
  if (selection.source.checkpoint.revision !== source.revision ||
      selection.source.checkpoint.structuralHash !== source.structuralHash)
    return "Source checkpoint is stale.";
  return null;
}

const belongsToProject = (project: Math3DProject, cursor: ProjectScientificCursor): boolean => {
  const entry = project.workspace.entries.find(item => item.expected.id === cursor.source.documentId);
  return !!entry && entry.module === cursor.sourceModule &&
    matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument(entry.checkpoint));
};

export function ProjectCursorInspector({ project }: { project: Math3DProject }) {
  const [linked, setLinked] = useState(true);
  const [cursor, setCursor] = useState<ProjectScientificCursor | null>(null);
  const [message, setMessage] = useState("");
  const points = useMemo(() => listProjectScientificSelections(project).filter(item => {
    if (item.identity.kind !== "authored" || item.geometry.kind !== "point" || item.source?.kind !== "document") return false;
    const documentId = item.source.documentId;
    return project.workspace.entries.some(entry => entry.expected.id === documentId && entry.module === "vector3d");
  }), [project]);
  useEffect(() => {
    if (!linked) return;
    return scientificCursorBus.subscribe(event => setCursor(event.kind === "project" && belongsToProject(project, event) ? event : null));
  }, [linked, project]);
  const pin = (id: string) => {
    try {
      const result = projectCursorFromSavedPoint(project, id, VECTOR3D_CURSOR_FRAME, "project-inspector");
      if (!result.ok) { setMessage(result.errors.join(" ")); return; }
      const published = scientificCursorBus.publishProject(result.value, result.value.source);
      setCursor(published);
      setMessage("Point pinned to the shared cursor.");
    } catch (error) { setMessage((error as Error).message); }
  };
  return <section className="project-dashboard-card" aria-label="Scientific cursor" data-testid="project-cursor-inspector">
    <div className="project-dashboard-card-heading"><h4>Scientific cursor</h4></div>
    <button type="button" data-testid="project-cursor-link" onClick={() => {
      setLinked(value => !value); setCursor(null);
    }}>{linked ? "Unlink cursor" : "Link cursor"}</button>
    {linked && cursor && <p data-testid="project-cursor-position">
      {cursor.sourceModule} · {cursor.position.map(value => Number(value.toPrecision(6))).join(", ")} · {cursor.mode}
    </p>}
    {linked && !cursor && <p>No current Project cursor.</p>}
    {!!points.length && <div><strong>Saved Vector Field points</strong><ul>{points.map(selection => {
      if (selection.identity.kind !== "authored") return null;
      const id = selection.identity.id;
      const reason = vectorPointCursorAvailability(project, selection);
      return <li key={id}><button type="button" disabled={!!reason || !linked}
        data-testid={`project-cursor-pin-${id}`} title={reason ?? "Publish this pinned point"}
        onClick={() => pin(id)}>Pin point {selection.geometry.kind === "point" ?
          selection.geometry.position.map(value => Number(value.toPrecision(6))).join(", ") : ""}</button>
        {reason && <small> {reason}</small>}</li>;
    })}</ul></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
