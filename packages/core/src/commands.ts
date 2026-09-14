import {
  canonicalJsonStringify,
  type CanonicalJsonValue,
} from "./documentIdentity";
import type { CameraPreset, OverlayDefinition, SceneDocument, SurfaceDefinition } from "./sceneDocument";
import type { GeometryObject } from "./sceneObjects";
import type { ValidationResult } from "./validation";

export type SceneCommand =
  | { type: "scene.set-title"; title: string }
  | { type: "scene.set-metadata"; metadata: Record<string, string | number | boolean | null> }
  | { type: "object.upsert"; object: GeometryObject }
  | { type: "object.remove"; objectId: string }
  | { type: "surface.upsert"; surface: SurfaceDefinition }
  | { type: "surface.remove"; surfaceId: string }
  | { type: "overlay.upsert"; overlay: OverlayDefinition }
  | { type: "overlay.remove"; overlayId: string }
  | { type: "camera.upsert"; camera: CameraPreset }
  | { type: "camera.set-active"; cameraId: string | null }
  | { type: "scene.replace"; scene: SceneDocument };

/** The pre-F03 scene-project command-log shape. Read-only compatibility only. */
export type LegacyCommandEnvelope = Readonly<{
  id: string;
  timestamp: number;
  actor?: string;
  command: SceneCommand;
}>;

export const COMMAND_ENVELOPE_SCHEMA_VERSION = 1 as const;

export const COMMAND_ORIGIN_KINDS = [
  "interactive",
  "script",
  "import",
  "replay",
  "migration",
  "system",
  "legacy",
] as const;

export type CommandOriginKind = (typeof COMMAND_ORIGIN_KINDS)[number];

export type CommandOrigin = Readonly<{
  kind: CommandOriginKind;
  sourceId?: string;
  actorId?: string;
}>;

/** Informational fields are persisted for inspection but never passed to projectors. */
export type CommandDiagnosticMetadata = Readonly<{
  issuedAt?: number;
  label?: string;
  correlationId?: string;
  details?: CanonicalJsonValue;
}>;

export type JsonCommand = Readonly<{
  type: string;
  payload: CanonicalJsonValue;
}>;

export type CommandEnvelope<Command extends JsonCommand = JsonCommand> = Readonly<{
  schemaVersion: typeof COMMAND_ENVELOPE_SCHEMA_VERSION;
  commandId: string;
  origin: CommandOrigin;
  command: Command;
  diagnostics?: CommandDiagnosticMetadata;
}>;

export type PersistedCommandEnvelope = CommandEnvelope | LegacyCommandEnvelope;

const COMMAND_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const COMMAND_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const ENVELOPE_FIELDS = new Set(["schemaVersion", "commandId", "origin", "command", "diagnostics"]);
const LEGACY_ENVELOPE_FIELDS = new Set(["id", "timestamp", "actor", "command"]);
const ORIGIN_FIELDS = new Set(["kind", "sourceId", "actorId"]);
const COMMAND_FIELDS = new Set(["type", "payload"]);
const DIAGNOSTIC_FIELDS = new Set(["issuedAt", "label", "correlationId", "details"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const unknownFields = (value: Record<string, unknown>, allowed: ReadonlySet<string>): string[] =>
  Object.keys(value).filter((field) => !allowed.has(field)).sort();

const validateExactFields = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[]
): void => {
  const extra = unknownFields(value, allowed);
  if (extra.length > 0) errors.push(`${path} contains unknown fields: ${extra.join(", ")}.`);
};

const validateOptionalIdentifier = (
  value: unknown,
  path: string,
  errors: string[]
): value is string | undefined => {
  if (value === undefined) return true;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 160) {
    errors.push(`${path} must be a non-empty string of at most 160 characters when provided.`);
    return false;
  }
  return true;
};

const canonicalClone = <Value>(value: Value): Value =>
  JSON.parse(canonicalJsonStringify(value)) as Value;

const deepFreeze = <Value>(value: Value): Value => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
};

const immutableJsonClone = <Value>(value: Value): Value => deepFreeze(canonicalClone(value));

const validateOrigin = (value: unknown, errors: string[]): value is CommandOrigin => {
  if (!isRecord(value)) {
    errors.push("command.origin must be an object.");
    return false;
  }
  validateExactFields(value, ORIGIN_FIELDS, "command.origin", errors);
  if (!(COMMAND_ORIGIN_KINDS as readonly unknown[]).includes(value.kind)) {
    errors.push(`command.origin.kind must be one of: ${COMMAND_ORIGIN_KINDS.join(", ")}.`);
  }
  validateOptionalIdentifier(value.sourceId, "command.origin.sourceId", errors);
  validateOptionalIdentifier(value.actorId, "command.origin.actorId", errors);
  return errors.length === 0;
};

const validateDiagnostics = (value: unknown, errors: string[]): value is CommandDiagnosticMetadata | undefined => {
  if (value === undefined) return true;
  if (!isRecord(value)) {
    errors.push("command.diagnostics must be an object when provided.");
    return false;
  }
  validateExactFields(value, DIAGNOSTIC_FIELDS, "command.diagnostics", errors);
  if (value.issuedAt !== undefined && (!Number.isFinite(value.issuedAt) || (value.issuedAt as number) < 0)) {
    errors.push("command.diagnostics.issuedAt must be a non-negative finite number when provided.");
  }
  validateOptionalIdentifier(value.label, "command.diagnostics.label", errors);
  validateOptionalIdentifier(value.correlationId, "command.diagnostics.correlationId", errors);
  if (value.details !== undefined) {
    try {
      canonicalJsonStringify(value.details);
    } catch (error) {
      errors.push(`command.diagnostics.details must be canonical JSON: ${String((error as Error).message ?? error)}`);
    }
  }
  return errors.length === 0;
};

const normalizeJsonCommand = (value: unknown, errors: string[]): JsonCommand | null => {
  if (!isRecord(value)) {
    errors.push("command.command must be an object.");
    return null;
  }
  validateExactFields(value, COMMAND_FIELDS, "command.command", errors);
  if (typeof value.type !== "string" || !COMMAND_TYPE.test(value.type)) {
    errors.push("command.command.type must be a namespaced lowercase command type such as 'scene.set-title'.");
  }
  if (!("payload" in value)) {
    errors.push("command.command.payload is required.");
  } else {
    try {
      canonicalJsonStringify(value.payload);
    } catch (error) {
      errors.push(`command.command.payload must be canonical JSON: ${String((error as Error).message ?? error)}`);
    }
  }
  if (errors.length > 0) return null;
  return immutableJsonClone({ type: value.type as string, payload: value.payload as CanonicalJsonValue });
};

const normalizeLegacyEnvelope = (value: Record<string, unknown>): ValidationResult<CommandEnvelope> => {
  const errors: string[] = [];
  validateExactFields(value, LEGACY_ENVELOPE_FIELDS, "legacy command envelope", errors);
  if (typeof value.id !== "string" || !COMMAND_ID.test(value.id)) {
    errors.push("legacy command.id must be a stable non-empty command identifier.");
  }
  if (!Number.isFinite(value.timestamp) || (value.timestamp as number) < 0) {
    errors.push("legacy command.timestamp must be a non-negative finite number.");
  }
  validateOptionalIdentifier(value.actor, "legacy command.actor", errors);
  if (!isRecord(value.command)) errors.push("legacy command.command must be an object.");
  const legacyType = isRecord(value.command) ? value.command.type : undefined;
  if (typeof legacyType !== "string" || !COMMAND_TYPE.test(legacyType)) {
    errors.push("legacy command.command.type must be a namespaced lowercase command type.");
  }
  let payload: CanonicalJsonValue | null = null;
  if (isRecord(value.command)) {
    const { type: _type, ...legacyPayload } = value.command;
    try {
      payload = immutableJsonClone(legacyPayload) as CanonicalJsonValue;
    } catch (error) {
      errors.push(`legacy command.command must be canonical JSON: ${String((error as Error).message ?? error)}`);
    }
  }
  if (errors.length > 0 || payload === null) return { ok: false, errors };

  const actorId = typeof value.actor === "string" ? value.actor : undefined;
  return {
    ok: true,
    value: immutableJsonClone({
      schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
      commandId: value.id as string,
      origin: { kind: "legacy" as const, ...(actorId ? { actorId } : {}) },
      command: { type: legacyType as string, payload },
      diagnostics: { issuedAt: value.timestamp as number },
    }),
  };
};

/** Validates v1 envelopes and upgrades the pre-F03 scene command-log shape in memory. */
export const normalizeCommandEnvelope = (value: unknown): ValidationResult<CommandEnvelope> => {
  if (!isRecord(value)) return { ok: false, errors: ["Command envelope must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return {
      ok: false,
      errors: [`Command envelope must be canonical JSON: ${String((error as Error).message ?? error)}`],
    };
  }
  if (!("schemaVersion" in value) && "id" in value) return normalizeLegacyEnvelope(value);

  const errors: string[] = [];
  validateExactFields(value, ENVELOPE_FIELDS, "command envelope", errors);
  if (value.schemaVersion !== COMMAND_ENVELOPE_SCHEMA_VERSION) {
    errors.push(`command.schemaVersion must be ${COMMAND_ENVELOPE_SCHEMA_VERSION}.`);
  }
  if (typeof value.commandId !== "string" || !COMMAND_ID.test(value.commandId)) {
    errors.push("command.commandId must start with an alphanumeric character and contain at most 160 ID-safe characters.");
  }
  validateOrigin(value.origin, errors);
  const command = normalizeJsonCommand(value.command, errors);
  validateDiagnostics(value.diagnostics, errors);
  if (errors.length > 0 || !command) return { ok: false, errors };

  return {
    ok: true,
    value: immutableJsonClone({
      schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
      commandId: value.commandId as string,
      origin: value.origin as CommandOrigin,
      command,
      ...(value.diagnostics === undefined
        ? {}
        : { diagnostics: value.diagnostics as CommandDiagnosticMetadata }),
    }),
  };
};

export const createCommandEnvelope = (
  value: Omit<CommandEnvelope, "schemaVersion">
): CommandEnvelope => {
  const result = normalizeCommandEnvelope({ schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION, ...value });
  if (!result.ok) throw new TypeError(result.errors.join(" "));
  return result.value;
};

export type CommandExecutionMode = "interactive" | "import" | "replay";

export type DeepReadonly<Value> =
  Value extends null | boolean | number | string ? Value
    : Value extends readonly (infer Entry)[] ? readonly DeepReadonly<Entry>[]
      : Value extends object ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
        : Value;

/** Returns a detached, recursively frozen canonical-JSON value. */
export const immutableCanonicalJsonClone = <Value>(value: Value): DeepReadonly<Value> =>
  immutableJsonClone(value) as DeepReadonly<Value>;

export type CommandDefinition<State> = Readonly<{
  type: string;
  validate: (payload: CanonicalJsonValue) => ValidationResult<CanonicalJsonValue>;
  project: (state: DeepReadonly<State>, payload: CanonicalJsonValue) => State;
}>;

export type CommandTransactionError = Readonly<{
  phase: "state" | "registry" | "envelope" | "validation" | "projection";
  commandIndex: number;
  commandId?: string;
  messages: readonly string[];
}>;

export type CommandTransactionResult<State> =
  | Readonly<{ ok: true; state: Readonly<State>; commands: readonly CommandEnvelope[] }>
  | Readonly<{ ok: false; errors: readonly CommandTransactionError[] }>;

type ValidatedCommand<State> = Readonly<{
  envelope: CommandEnvelope;
  definition: CommandDefinition<State>;
  payload: CanonicalJsonValue;
}>;

const transactionError = (
  phase: CommandTransactionError["phase"],
  commandIndex: number,
  messages: readonly string[],
  commandId?: string
): CommandTransactionError => ({
  phase,
  commandIndex,
  ...(commandId ? { commandId } : {}),
  messages: [...messages],
});

/**
 * Projects a batch without mutating its input. All envelopes and command payloads
 * are normalized and validated before the first projector is invoked.
 */
export const projectCommandTransaction = <State>(
  input: State,
  envelopes: readonly unknown[],
  definitions: readonly CommandDefinition<State>[],
  mode: CommandExecutionMode = "interactive"
): CommandTransactionResult<State> => {
  let initialState: State;
  try {
    initialState = immutableJsonClone(input);
  } catch (error) {
    return {
      ok: false,
      errors: [transactionError("state", -1, [
        `Transaction input must be canonical JSON: ${String((error as Error).message ?? error)}`,
      ])],
    };
  }

  const registry = new Map<string, CommandDefinition<State>>();
  const registryErrors: CommandTransactionError[] = [];
  definitions.forEach((definition, index) => {
    if (!COMMAND_TYPE.test(definition.type)) {
      registryErrors.push(transactionError("registry", index, [
        `Command definition type '${definition.type}' is not a valid namespaced command type.`,
      ]));
    } else if (registry.has(definition.type)) {
      registryErrors.push(transactionError("registry", index, [
        `Duplicate command definition '${definition.type}'.`,
      ]));
    } else {
      registry.set(definition.type, definition);
    }
  });
  if (registryErrors.length > 0) return { ok: false, errors: registryErrors };

  const validated: ValidatedCommand<State>[] = [];
  const validationErrors: CommandTransactionError[] = [];
  const commandIds = new Set<string>();
  envelopes.forEach((candidate, commandIndex) => {
    const normalized = normalizeCommandEnvelope(candidate);
    if (!normalized.ok) {
      validationErrors.push(transactionError("envelope", commandIndex, normalized.errors));
      return;
    }
    const envelope = normalized.value;
    if (commandIds.has(envelope.commandId)) {
      validationErrors.push(transactionError("validation", commandIndex, [
        `Duplicate command ID '${envelope.commandId}' in transaction.`,
      ], envelope.commandId));
      return;
    }
    commandIds.add(envelope.commandId);
    if (mode === "interactive" && envelope.command.type === "scene.replace") {
      validationErrors.push(transactionError("validation", commandIndex, [
        "scene.replace is reserved for controlled import, migration, or replay and is not allowed interactively.",
      ], envelope.commandId));
      return;
    }
    const definition = registry.get(envelope.command.type);
    if (!definition) {
      validationErrors.push(transactionError("validation", commandIndex, [
        `No command definition is registered for '${envelope.command.type}'.`,
      ], envelope.commandId));
      return;
    }
    let payloadResult: ValidationResult<CanonicalJsonValue>;
    try {
      payloadResult = definition.validate(envelope.command.payload);
    } catch (error) {
      payloadResult = {
        ok: false,
        errors: [`Command validator threw: ${String((error as Error).message ?? error)}`],
      };
    }
    if (!payloadResult.ok) {
      validationErrors.push(transactionError("validation", commandIndex, payloadResult.errors, envelope.commandId));
      return;
    }
    try {
      validated.push({ envelope, definition, payload: immutableJsonClone(payloadResult.value) });
    } catch (error) {
      validationErrors.push(transactionError("validation", commandIndex, [
        `Normalized payload must be canonical JSON: ${String((error as Error).message ?? error)}`,
      ], envelope.commandId));
    }
  });
  if (validationErrors.length > 0) return { ok: false, errors: validationErrors };

  let state = initialState;
  for (let commandIndex = 0; commandIndex < validated.length; commandIndex += 1) {
    const entry = validated[commandIndex]!;
    try {
      state = immutableJsonClone(entry.definition.project(state as DeepReadonly<State>, entry.payload));
    } catch (error) {
      return {
        ok: false,
        errors: [transactionError("projection", commandIndex, [
          `Command projector failed: ${String((error as Error).message ?? error)}`,
        ], entry.envelope.commandId)],
      };
    }
  }

  return { ok: true, state, commands: validated.map((entry) => entry.envelope) };
};
