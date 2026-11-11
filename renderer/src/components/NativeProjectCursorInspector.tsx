import { useEffect, useState } from "react";
import type { KernelWorkspaceDocument, KernelWorkspaceModule, Math3DProject } from "@math3d/core";
import { projectNativeCursor, type NativeCursorProjection } from "../projects/projectNativeCursor";
import { scientificCursorBus } from "./scientificCursor";

/** Native Inspector readout of a source-qualified Project cursor; no computed value is inferred. */
export function NativeProjectCursorInspector({ project, document, module }: {
  project: Math3DProject | null | undefined; document: KernelWorkspaceDocument;
  module: KernelWorkspaceModule;
}) {
  const [projection, setProjection] = useState<NativeCursorProjection | null>(null);
  useEffect(() => {
    setProjection(null);
    if (!project) return;
    return scientificCursorBus.subscribe(event => {
      if (event.kind !== "project") { setProjection(null); return; }
      if (!project.workspace.entries.some(entry => entry.expected.id === event.source.documentId)) {
        setProjection(null); return;
      }
      setProjection(projectNativeCursor(project, document, module, event));
    });
  }, [project, document.identity.id, document.identity.revision, document.identity.structuralHash, module]);
  if (!project || !projection) return null;
  return <section data-testid={`native-cursor-${module}`} aria-label="Linked scientific selection">
    <strong>Linked scientific selection</strong>
    {projection.status === "matched" ? <p data-testid="native-cursor-coordinates">
      {projection.axes.map((axis, index) => `${axis}=${projection.coordinates[index]}`).join(", ")}
      {` · ${projection.unit} · ${projection.method}`}</p> :
      <p role="status" data-testid="native-cursor-withheld">Selection withheld: {projection.reason}</p>}
  </section>;
}
