import { type CanonicalJsonValue } from "./documentIdentity";
import { type CommandDefinition } from "./commands";
import { normalizeGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import { isGraph2DViewport, type Graph2DViewport } from "./graph2dViewport";

export const GRAPH2D_COMMAND_TYPES = { setViewport: "graph2d.viewport.set" } as const;
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
}];
