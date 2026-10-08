import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { SurfaceViewer, type CameraSyncState } from "../components/SurfaceViewer";
import type { SavedMeshViewportState } from "../projects/SavedMeshAnalysisPanel";
import { pickedMeshVertex } from "../projects/savedMeshExploration";
import { documentPresentationKey, readDocumentPresentation, saveDocumentPresentation } from "./documentPresentation";

/** Explicit saved-buffer binding over the existing Mesh renderer. */
export function MeshDocumentViewport({ projectId, documentId, revision, hash, view }: { projectId?: string; documentId: string; revision: number; hash: string; view: SavedMeshViewportState }) {
  const key = documentPresentationKey(projectId ?? "project", documentId);
  const camera = useRef<CameraSyncState | null>(readDocumentPresentation(localStorage.getItem(key)).camera);
  const rememberCamera = useCallback((value: CameraSyncState) => { camera.current = value; }, []);
  useEffect(() => {
    const save = () => saveDocumentPresentation(key, { presentation: "sampled", wireframe: false, camera: camera.current });
    window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  }, [key]);
  const override = useMemo(() => ({ ...view.mesh, id: documentId }), [view.mesh, documentId]);
  const points = useMemo(() => [view.start, view.end, view.inspected].flatMap((index, i) => index !== undefined ? [{ points: [{ x: view.mesh.positions[3 * index]!, y: view.mesh.positions[3 * index + 1]!, z: view.mesh.positions[3 * index + 2]! }], color: [0x16a34a, 0x9333ea, 0x0891b2][i]! }] : []), [view.mesh, view.start, view.end, view.inspected]);
  const paths = useMemo(() => view.path?.length ? [{ lines: [view.path.map(index => ({ x: view.mesh.positions[3 * index]!, y: view.mesh.positions[3 * index + 1]!, z: view.mesh.positions[3 * index + 2]! }))], color: 0xf59e0b }] : [], [view.mesh, view.path]);
  return <div style={{ width: "100%", height: "100%" }} data-testid="document-mesh-viewport" data-document-id={documentId} data-document-revision={revision} data-source-hash={hash} data-field-colours={Boolean(view.colors)}>
    <SurfaceViewer surfaceId="surface_mesh" surfaceMeshOverride={override} surfaceMeshColors={view.colors} colorMode="solid" showOverlayControls={false} overlayPolylineGroups={paths}
      isCameraLeader onCameraSync={rememberCamera} cameraOverride={camera.current} cameraOverrideToken={revision} overlayPointSets={points}
      geodesicPathEnabled onGeodesicPathPick={info => {
        if (info.faceIndex === undefined) return;
        const index = pickedMeshVertex(view.mesh, info.faceIndex, info.point);
        if (view.picking) view.onPick(index); else view.onInspect(index);
      }} />
  </div>;
}
