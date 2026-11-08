import { useEffect, useMemo, useState } from "react";
import { listProjectScientificSelections, matchesScientificSourceGeneration, readProjectCoordinateFrame,
  viewerSourceFromDocument, type AdapterFrame, type Math3DProject,
  type ScientificSelection } from "@math3d/core";
import { projectCursorFromSavedPoint } from "./projectCursorAdapter";
import { scientificCursorBus, type ProjectScientificCursor } from "./scientificCursor";
import { VECTOR3D_CURSOR_FRAME } from "../vectorfield3d/vectorFieldCursor";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

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

export function projectPointCursorFrame(project: Math3DProject, selection: ScientificSelection):
  { frame: AdapterFrame; reason: null } | { frame: null; reason: string } {
  if (selection.source?.kind !== "document") return { frame: null, reason: "Pinned document point required." };
  const documentId = selection.source.documentId;
  const entry = project.workspace.entries.find(item => item.expected.id === documentId);
  if (!entry) return { frame: null, reason: "Source document is unavailable." };
  if (entry.module === "vector3d") {
    const reason = vectorPointCursorAvailability(project, selection);
    return reason ? { frame: null, reason } : { frame: VECTOR3D_CURSOR_FRAME, reason: null };
  }
  if (entry.module !== "mesh" && entry.module !== "surface")
    return { frame: null, reason: "Only Field, Surface and Mesh points are supported here." };
  if (selection.identity.kind !== "authored" || selection.geometry.kind !== "point" || !selection.source.checkpoint)
    return { frame: null, reason: "Point selection and pinned source checkpoint required." };
  const document = verifyMixedWorkspaceReplay(project.workspace).get(entry.expected.id);
  if (!document || !matchesScientificSourceGeneration(viewerSourceFromDocument(document),
    viewerSourceFromDocument({ identity: entry.expected })) ||
    selection.source.checkpoint.revision !== document.identity.revision ||
    selection.source.checkpoint.structuralHash !== document.identity.structuralHash)
    return { frame: null, reason: "Saved point source checkpoint is stale or unavailable." };
  const declaration = readProjectCoordinateFrame(document);
  if (declaration.status !== "declared" || !declaration.value)
    return { frame: null, reason: "Source has no valid declared coordinate frame." };
  const axes = declaration.value.axes.map(name => ({ name, dimension: "length", unit: declaration.value!.unit }));
  if (selection.frame.kind !== "cartesian" || selection.frame.axes.length !== 3 ||
      selection.frame.axes.some((axis, index) => axis.name !== axes[index]?.name || axis.unit !== axes[index]?.unit) ||
      selection.geometry.position.length !== 3 || !selection.geometry.position.every(Number.isFinite))
    return { frame: null, reason: "Saved point axes or units differ from the source declaration." };
  return { frame: { kind: "cartesian", frameId: declaration.value.frame, axes }, reason: null };
}

const belongsToProject = (project: Math3DProject, cursor: ProjectScientificCursor): boolean => {
  const entry = project.workspace.entries.find(item => item.expected.id === cursor.source.documentId);
  return !!entry && entry.module === cursor.sourceModule &&
    matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument({ identity: entry.expected }));
};

export function ProjectCursorInspector({ project }: { project: Math3DProject }) {
  const [linked, setLinked] = useState(true);
  const [cursor, setCursor] = useState<ProjectScientificCursor | null>(null);
  const [message, setMessage] = useState("");
  const points = useMemo(() => listProjectScientificSelections(project, verifyMixedWorkspaceReplay(project.workspace)).filter(item => {
    if (item.identity.kind !== "authored" || item.geometry.kind !== "point" || item.source?.kind !== "document") return false;
    const documentId = item.source.documentId;
    return project.workspace.entries.some(entry => entry.expected.id === documentId &&
      ["vector3d", "surface", "mesh"].includes(entry.module));
  }), [project]);
  useEffect(() => {
    if (!linked) return;
    return scientificCursorBus.subscribe(event => setCursor(event.kind === "project" && belongsToProject(project, event) ? event : null));
  }, [linked, project]);
  const pin = (id: string, frame: AdapterFrame) => {
    try {
      const result = projectCursorFromSavedPoint(project, id, frame, "project-inspector");
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
    {!!points.length && <div><strong>Saved source points</strong><ul>{points.map(selection => {
      if (selection.identity.kind !== "authored") return null;
      const id = selection.identity.id;
      const { frame, reason } = projectPointCursorFrame(project, selection);
      return <li key={id}><button type="button" disabled={!!reason || !linked}
        data-testid={`project-cursor-pin-${id}`} title={reason ?? "Publish this pinned point"}
        onClick={() => { if (frame) pin(id, frame); }}>Pin point {selection.geometry.kind === "point" ?
          selection.geometry.position.map(value => Number(value.toPrecision(6))).join(", ") : ""}</button>
        {reason && <small> {reason}</small>}</li>;
    })}</ul></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
