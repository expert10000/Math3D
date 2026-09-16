import type { CommandDefinition } from "./commands";
import { canonicalJsonStringify, type CanonicalJsonValue } from "./documentIdentity";
import {
  createVolumeDocument, normalizeVolumeDocument, replaceVolumeDocumentAnalysisSettings,
  replaceVolumeDocumentDisplay, replaceVolumeDocumentSource, type VolumeDocument,
} from "./volumeDocument";

export const VOLUME_COMMAND_TYPES = {
  replaceSource: "volume.source.replace",
  setAnalysisSettings: "volume.analysis-settings.set",
  setVisible: "volume.display.visible.set",
} as const;

const object = (value: CanonicalJsonValue) => !!value && typeof value === "object" && !Array.isArray(value);
export const volumeCommandDefinitions: readonly CommandDefinition<VolumeDocument>[] = [
  {
    type: VOLUME_COMMAND_TYPES.replaceSource,
    validate: (value) => {
      if (!object(value)) return { ok: false, errors: ["Volume source must be an object."] };
      try {
        const source = createVolumeDocument({ source: value as VolumeDocument["source"] }).source;
        return { ok: true, value: JSON.parse(canonicalJsonStringify(source)) as CanonicalJsonValue };
      } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
    },
    project: (state, payload) => replaceVolumeDocumentSource(state as VolumeDocument, payload as VolumeDocument["source"]),
  },
  {
    type: VOLUME_COMMAND_TYPES.setAnalysisSettings,
    validate: (value) => object(value) ? { ok: true, value } : { ok: false, errors: ["Volume analysis settings must be an object."] },
    project: (state, payload) => replaceVolumeDocumentAnalysisSettings(state as VolumeDocument, payload),
  },
  {
    type: VOLUME_COMMAND_TYPES.setVisible,
    validate: (value) => typeof value === "boolean" ? { ok: true, value } : { ok: false, errors: ["Volume visibility must be boolean."] },
    project: (state, payload) => replaceVolumeDocumentDisplay(state as VolumeDocument, payload as boolean),
  },
];

export const createVolumeCommandState = (document: VolumeDocument): VolumeDocument => {
  const normalized = normalizeVolumeDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
