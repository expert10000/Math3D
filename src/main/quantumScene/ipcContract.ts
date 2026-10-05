import type { Math3DQuantumDocument } from "./importer";
import type { QuantumSceneWorkspaceReference } from "./recent";

export type QuantumSceneOpenResponse =
  | { ok: true; canceled: false; directory: string; document: Math3DQuantumDocument; remembered: boolean;
      reference: QuantumSceneWorkspaceReference;
      mappedObjectIds: string[]; deferredObjectIds: string[]; deferredFieldIds: string[] }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };
