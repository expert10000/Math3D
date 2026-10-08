import type { CameraSyncState } from "../components/SurfaceViewer";
import { readSurfaceDocumentView } from "../surfaceAnalysis/surfaceDocumentView";
export const documentPresentationKey = (projectId: string, documentId: string) => `math3d.document-presentation.v1.${projectId}.${documentId}`;
export function readDocumentPresentation(raw: string | null) {
  try {
    const value = raw ? JSON.parse(raw) : {};
    const validCamera = value.camera && ["position", "target", "up"].every(name => ["x", "y", "z"].every(axis => typeof value.camera[name]?.[axis] === "number" && Number.isFinite(value.camera[name][axis])));
    return { presentation: value.presentation === "sampled" ? "sampled" as const : "surface" as const,
      wireframe: value.wireframe === true, camera: validCamera ? value.camera as CameraSyncState : null, surfaceView: readSurfaceDocumentView(value.surfaceView) };
  } catch { return { presentation: "surface" as const, wireframe: false, camera: null, surfaceView: readSurfaceDocumentView(null) }; }
}
export function saveDocumentPresentation(key: string, value: Omit<ReturnType<typeof readDocumentPresentation>, "surfaceView"> & Partial<Pick<ReturnType<typeof readDocumentPresentation>, "surfaceView">>) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Optional UI storage never prevents document saving. */ }
}
