import type { CameraSyncState } from "../components/SurfaceViewer";
export const documentPresentationKey = (projectId: string, documentId: string) => `math3d.document-presentation.v1.${projectId}.${documentId}`;
export function readDocumentPresentation(raw: string | null) {
  try {
    const value = raw ? JSON.parse(raw) : {};
    const validCamera = value.camera && ["position", "target", "up"].every(name => ["x", "y", "z"].every(axis => typeof value.camera[name]?.[axis] === "number" && Number.isFinite(value.camera[name][axis])));
    return { presentation: value.presentation === "sampled" ? "sampled" as const : "surface" as const,
      wireframe: value.wireframe === true, camera: validCamera ? value.camera as CameraSyncState : null };
  } catch { return { presentation: "surface" as const, wireframe: false, camera: null }; }
}
export function saveDocumentPresentation(key: string, value: ReturnType<typeof readDocumentPresentation>) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Optional UI storage never prevents document saving. */ }
}
