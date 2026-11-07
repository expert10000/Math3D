import React from "react";
import { MeshDocumentViewport } from "../workspace/MeshDocumentViewport";
import type { TetrahedralMeshDocumentAdapter } from "./tetrahedralMeshDocumentAdapter";

/** The saved cells remain in the document resource; this viewport draws their verified outward boundary. */
export function TetrahedralMeshViewport({ adapter }: { adapter: TetrahedralMeshDocumentAdapter }) {
  const document = adapter.document();
  const mesh = adapter.boundaryMesh();
  return <div data-testid="tetrahedral-mesh-viewport" data-document-id={document.identity.id}
    data-source-hash={document.identity.structuralHash}
    data-tetrahedra={adapter.geometry().cells.length} style={{ width: "100%", height: "100%" }}>
    <MeshDocumentViewport documentId={document.identity.id} revision={document.identity.revision}
      hash={document.identity.structuralHash}
      view={{ mesh, picking: false, onInspect: () => {}, onPick: () => {}, onCancelPick: () => {} }} />
  </div>;
}
