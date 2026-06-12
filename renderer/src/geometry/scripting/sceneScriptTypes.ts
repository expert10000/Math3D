import type { GeometryObject } from "../proceduralObjects";

export type SceneScriptAssignment = {
  key: string;
  value: string;
};

export type SceneScriptCommandBase = {
  line: number;
  raw: string;
};

export type ClearCommand = SceneScriptCommandBase & {
  kind: "clear";
};

export type AddObjectCommand = SceneScriptCommandBase & {
  kind: "add";
  objectType: string;
  id: string | null;
  assignments: SceneScriptAssignment[];
};

export type SetObjectCommand = SceneScriptCommandBase & {
  kind: "set";
  id: string;
  assignments: SceneScriptAssignment[];
};

export type DeleteObjectCommand = SceneScriptCommandBase & {
  kind: "delete";
  id: string;
};

export type VisibilityCommand = SceneScriptCommandBase & {
  kind: "setVisibility";
  id: string;
  visible: boolean;
};

export type SelectCommand = SceneScriptCommandBase & {
  kind: "select";
  id: string;
};

export type SceneScriptCommand =
  | ClearCommand
  | AddObjectCommand
  | SetObjectCommand
  | DeleteObjectCommand
  | VisibilityCommand
  | SelectCommand;

export type SceneScriptDiagnosticCode =
  | "unknown-command"
  | "missing-object-type"
  | "missing-object-id"
  | "missing-assignment"
  | "invalid-assignment"
  | "unknown-object-type"
  | "duplicate-object-id"
  | "object-not-found"
  | "invalid-number"
  | "invalid-color"
  | "invalid-boolean"
  | "unknown-field";

export type SceneScriptDiagnostic = {
  severity: "error";
  line: number;
  code: SceneScriptDiagnosticCode;
  message: string;
};

export type SceneScriptParseResult = {
  commands: SceneScriptCommand[];
  diagnostics: SceneScriptDiagnostic[];
};

export type SceneScriptExecutionStats = {
  created: number;
  updated: number;
  deleted: number;
};

export type SceneScriptExecutionSuccess = {
  ok: true;
  commands: SceneScriptCommand[];
  diagnostics: [];
  objects: GeometryObject[];
  selectedObjectId: string | null;
  stats: SceneScriptExecutionStats;
};

export type SceneScriptExecutionFailure = {
  ok: false;
  commands: SceneScriptCommand[];
  diagnostics: SceneScriptDiagnostic[];
  error: SceneScriptDiagnostic;
};

export type SceneScriptExecutionResult = SceneScriptExecutionSuccess | SceneScriptExecutionFailure;

export type ExecuteSceneScriptInput = {
  script: string;
  objects: GeometryObject[];
  datasetObjectIds?: Iterable<string>;
  selectedObjectId?: string | null;
};
