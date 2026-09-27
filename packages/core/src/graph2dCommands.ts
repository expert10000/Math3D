import { advanceDocumentIdentity, structuralHash, type CanonicalJsonValue } from "./documentIdentity";
import { type CommandDefinition } from "./commands";
import { normalizeGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import { isGraph2DViewport, type Graph2DViewport } from "./graph2dViewport";

export const GRAPH2D_COMMAND_TYPES = { setViewport: "graph2d.viewport.set", replaceScene: "graph2d.scene.replace" } as const;
export const GRAPH2D_SCENE_OPERATIONS = ["create", "edit", "duplicate", "reorder", "visibility", "style", "delete", "restore"] as const;
export type Graph2DSceneOperation = (typeof GRAPH2D_SCENE_OPERATIONS)[number];
export type Graph2DCommandState = Readonly<{ document: Graph2DDocument }>;

export const graph2dCommandDefinitions: readonly CommandDefinition<Graph2DCommandState>[] = [{
  type: GRAPH2D_COMMAND_TYPES.setViewport,
  validate: (payload: CanonicalJsonValue) =>
    payload && typeof payload === "object" && !Array.isArray(payload) &&
    Object.keys(payload).length === 1 && "viewport" in payload && isGraph2DViewport(payload.viewport)
      ? { ok: true, value: payload }
      : { ok: false, errors: ["Graph2D viewport command requires a valid viewport."] },
  project: (state, payload) => {
    const viewport = (payload as { viewport: Graph2DViewport }).viewport;
    const candidate = { ...state.document, display: { ...state.document.display, viewport } };
    const normalized = normalizeGraph2DDocument(candidate);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    return { document: normalized.value };
  },
}, {
  type: GRAPH2D_COMMAND_TYPES.replaceScene,
  validate: (payload: CanonicalJsonValue) =>
    payload && typeof payload === "object" && !Array.isArray(payload) &&
    Object.keys(payload).sort().join("|") === "display|operation|selection|source" &&
    GRAPH2D_SCENE_OPERATIONS.includes((payload as Record<string, CanonicalJsonValue>).operation as Graph2DSceneOperation)
      ? { ok: true, value: payload }
      : { ok: false, errors: ["Graph2D scene command requires a typed complete scene."] },
  project: (state, payload) => {
    const scene = payload as { source: Graph2DDocument["source"]; display: Graph2DDocument["display"]; selection: Graph2DDocument["selection"] };
    const current = state.document as Graph2DDocument;
    const changed = structuralHash(scene.source) !== current.identity.structuralHash;
    const candidate = { ...current, source: scene.source, display: scene.display, selection: scene.selection,
      identity: changed ? advanceDocumentIdentity(current.identity, scene.source) : current.identity };
    const normalized = normalizeGraph2DDocument(candidate);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    return { document: normalized.value };
  },
}];
