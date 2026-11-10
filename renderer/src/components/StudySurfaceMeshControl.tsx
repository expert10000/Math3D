import { useState } from "react";
import { viewerSourceFromDocument, type Math3DProject } from "@math3d/core";
import { qualifyStudySurfaceMeshLink, type QualifiedStudySurfaceMesh } from
  "../projects/studySurfaceMeshLink";
import { scientificCursorBus } from "./scientificCursor";

/** Shares a coordinate marker, never an inferred Mesh vertex or curvature value. */
export function StudySurfaceMeshControl({ project, pair, studyId }: {
  project: Math3DProject; pair: QualifiedStudySurfaceMesh; studyId: string;
}) {
  const [origin, setOrigin] = useState<"surface" | "mesh">("surface");
  const [coordinates, setCoordinates] = useState(["", "", ""]);
  const [message, setMessage] = useState("");
  return <div data-testid="project-study-surface-mesh-control">
    <label>Source <select aria-label="Coordinate source" value={origin}
      onChange={event => setOrigin(event.target.value as "surface" | "mesh")}>
      <option value="surface">Surface</option><option value="mesh">Mesh</option>
    </select></label>
    {pair.frame.axes.map((axis, index) => <label key={axis}>{axis} ({pair.frame.unit})
      <input type="number" value={coordinates[index]}
        onChange={event => setCoordinates(current => current.map((value, at) => at === index ?
          event.target.value : value))} /></label>)}
    <button type="button" data-testid="project-study-share-surface-mesh-coordinate" onClick={() => {
      const current = project.workspace.studies?.find(item => item.id === studyId);
      const checked = current && qualifyStudySurfaceMeshLink(project, current);
      if (!checked || checked.status !== "ready") {
        setMessage(checked?.status === "disabled" ? checked.reason : "Study is unavailable."); return;
      }
      const xyz = coordinates.map(value => value.trim() === "" ? NaN : Number(value));
      if (!xyz.every(value => Number.isFinite(value) && Math.abs(value) <= 1e12)) {
        setMessage("Enter three finite physical coordinates."); return;
      }
      const document = origin === "surface" ? checked.value.surface : checked.value.mesh;
      const frame = { kind: "cartesian" as const, frameId: checked.value.frame.frame,
        axes: checked.value.frame.axes.map(name => ({ name, dimension: "length" as const,
          unit: checked.value.frame.unit })) };
      scientificCursorBus.publishProject({ source: viewerSourceFromDocument(document),
        sourceModule: origin, frame, position: xyz, resourceSha256: origin === "mesh" ?
          checked.value.mesh.source.resource.checksum.slice(7) : null,
        mode: "locked", originViewId: `study:${studyId}` }, viewerSourceFromDocument(document));
      setMessage(`${origin === "surface" ? "Surface" : "Mesh"} coordinate (${xyz.join(", ")}) ` +
        `${checked.value.frame.unit} in ${checked.value.frame.frame} is shared with the other view. ` +
        "No target Mesh element or curvature value is inferred.");
    }}>Share physical coordinate</button>
    {message && <p role="status" data-testid="project-study-surface-mesh-result">{message}</p>}
  </div>;
}
