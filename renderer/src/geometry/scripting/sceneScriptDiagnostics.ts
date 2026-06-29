import type { SceneScriptDiagnostic, SceneScriptDiagnosticCode } from "./sceneScriptTypes";

export const createSceneScriptDiagnostic = (
  line: number,
  code: SceneScriptDiagnosticCode,
  message: string
): SceneScriptDiagnostic => ({
  severity: "error",
  line,
  code,
  message,
});

export const formatSceneScriptDiagnostic = (diagnostic: SceneScriptDiagnostic): string =>
  `line ${diagnostic.line}: ${diagnostic.message}`;
