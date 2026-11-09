import { analysisResultKey, isAnalysisResultCurrent } from "../analysis/resultStore";
import type { SurfaceIdentity, SurfaceAnalysisPayload } from "./contracts";
import { getSurfaceAnalysisResult, type SurfaceAnalysisResultStore } from "./infrastructure";

/** Change only display metadata. Geometry, result version and computation history stay intact. */
export const editSurfaceLayerDisplay = (
  store: SurfaceAnalysisResultStore,
  identity: SurfaceIdentity,
  kind: "surface-curves" | "surface-features",
  layerId: string,
  action: "toggle" | "select",
): SurfaceAnalysisResultStore => {
  const result = getSurfaceAnalysisResult<SurfaceAnalysisPayload>(store, identity, kind);
  const payload = result?.payload;
  const data = payload?.data;
  if (!result || !isAnalysisResultCurrent(store, result) || !data ||
    (data.kind !== "curve-layers" && data.kind !== "feature-layers") ||
    (kind === "surface-curves" ? data.kind !== "curve-layers" : data.kind !== "feature-layers") ||
    !data.layers.some(layer => layer.layerId === layerId && layer.identity.key === identity.key)) return store;
  const layers = data.layers.map(layer => layer.layerId === layerId
    ? action === "toggle" ? { ...layer, visible: !layer.visible } : { ...layer, selected: true }
    : action === "select" && layer.selected ? { ...layer, selected: false } : layer);
  const key = analysisResultKey(identity, kind);
  return { ...store, entries: { ...store.entries,
    [key]: { ...result, payload: { ...payload, data: { ...data, layers } } } } };
};
