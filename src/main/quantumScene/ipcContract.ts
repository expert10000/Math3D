import type { Math3DQuantumDocument } from "./importer";

export type QuantumSceneOpenResponse =
  | { ok: true; canceled: false; directory: string; document: Math3DQuantumDocument; remembered: boolean;
      mappedObjectIds: string[]; deferredObjectIds: string[]; deferredFieldIds: string[] }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };
