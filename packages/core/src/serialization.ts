import { normalizeCommandEnvelope, type CommandEnvelope } from "./commands";
import type { SceneDocument } from "./sceneDocument";
import { validateSceneDocument, type ValidationResult } from "./validation";

export const SCENE_PROJECT_FORMAT = "math3d.scene-project";
export const SCENE_PROJECT_VERSION = 1;

export type SceneProjectDocument = {
  format: typeof SCENE_PROJECT_FORMAT;
  version: typeof SCENE_PROJECT_VERSION;
  scene: SceneDocument;
  commandLog?: CommandEnvelope[];
  workbookId?: string;
};

export const createSceneProjectDocument = (scene: SceneDocument): SceneProjectDocument => ({
  format: SCENE_PROJECT_FORMAT,
  version: SCENE_PROJECT_VERSION,
  scene,
});

export const serializeSceneProject = (document: SceneProjectDocument): string =>
  JSON.stringify(document, null, 2);

export const deserializeSceneProject = (serialized: string): ValidationResult<SceneProjectDocument> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    return { ok: false, errors: [`Invalid JSON: ${String((error as Error).message ?? error)}`] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errors: ["Project file must be a JSON object."] };
  }

  const candidate = parsed as Partial<SceneProjectDocument>;
  if (candidate.format !== SCENE_PROJECT_FORMAT) {
    return {
      ok: false,
      errors: [`Unsupported format '${String(candidate.format ?? "unknown")}'. Expected '${SCENE_PROJECT_FORMAT}'.`],
    };
  }
  if (candidate.version !== SCENE_PROJECT_VERSION) {
    return {
      ok: false,
      errors: [`Unsupported version '${String(candidate.version ?? "unknown")}'. Expected '${SCENE_PROJECT_VERSION}'.`],
    };
  }
  const sceneResult = validateSceneDocument(candidate.scene);
  if (!sceneResult.ok) return { ok: false, errors: sceneResult.errors };

  const rawCommandLog = (parsed as Record<string, unknown>).commandLog;
  let commandLog: CommandEnvelope[] | undefined;
  if (rawCommandLog !== undefined) {
    if (!Array.isArray(rawCommandLog)) {
      return { ok: false, errors: ["Project commandLog must be an array when provided."] };
    }
    commandLog = [];
    for (let index = 0; index < rawCommandLog.length; index += 1) {
      const commandResult = normalizeCommandEnvelope(rawCommandLog[index]);
      if (!commandResult.ok) {
        return {
          ok: false,
          errors: commandResult.errors.map((error) => `commandLog[${index}]: ${error}`),
        };
      }
      commandLog.push(commandResult.value);
    }
  }

  return {
    ok: true,
    value: {
      format: SCENE_PROJECT_FORMAT,
      version: SCENE_PROJECT_VERSION,
      scene: sceneResult.value,
      commandLog,
      workbookId: typeof candidate.workbookId === "string" ? candidate.workbookId : undefined,
    },
  };
};
