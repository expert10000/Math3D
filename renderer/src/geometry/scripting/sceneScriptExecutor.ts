import {
  GEOMETRY_OBJECT_REGISTRY,
  createGeometryObject,
  type GeometryObject,
  type GeometryObjectType,
} from "../proceduralObjects";
import { createSceneScriptDiagnostic } from "./sceneScriptDiagnostics";
import { parseSceneScript } from "./sceneScriptParser";
import type {
  ExecuteSceneScriptInput,
  SceneScriptAssignment,
  SceneScriptDiagnostic,
  SceneScriptExecutionResult,
  SceneScriptExecutionStats,
} from "./sceneScriptTypes";

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const cloneGeometryObject = (object: GeometryObject): GeometryObject => ({
  ...object,
  params: { ...object.params },
  transform: {
    position: { ...object.transform.position },
    rotation: { ...object.transform.rotation },
    scale: { ...object.transform.scale },
  },
  material: {
    color: Number.isFinite(object.material?.color) ? object.material.color : 0x8aa4ff,
    opacity: Number.isFinite(object.material?.opacity) ? clampNumber(object.material.opacity!, 0, 1) : 1,
    roughness: Number.isFinite(object.material?.roughness) ? clampNumber(object.material.roughness!, 0, 1) : 0.3,
    metalness: Number.isFinite(object.material?.metalness) ? clampNumber(object.material.metalness!, 0, 1) : 0.1,
  },
});

const parseScriptBool = (value: string): boolean | null => {
  const raw = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return null;
};

const parseScriptColor = (value: string): number | null => {
  const raw = value.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(raw)) {
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    return Number.parseInt(hex, 16);
  }
  if (/^0x[0-9a-fA-F]{6}$/.test(raw)) {
    return Number.parseInt(raw.slice(2), 16);
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return clampNumber(Math.round(numeric), 0, 0xffffff);
};

const resolveScriptObjectType = (objectType: string): GeometryObjectType | null => {
  const normalized = objectType.trim().toLowerCase();
  if (normalized === "cube") return "box";
  if (normalized in GEOMETRY_OBJECT_REGISTRY) return normalized as GeometryObjectType;
  return null;
};

const applyAssignment = (
  object: GeometryObject,
  assignment: SceneScriptAssignment,
  line: number
): SceneScriptDiagnostic | null => {
  const { key, value } = assignment;
  const keyLower = key.toLowerCase();

  if (keyLower === "x" || keyLower === "y" || keyLower === "z") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", `invalid number for ${key}`);
    object.transform.position[keyLower] = number;
    return null;
  }
  if (keyLower === "rx" || keyLower === "ry" || keyLower === "rz") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", `invalid number for ${key}`);
    object.transform.rotation[keyLower[1] as "x" | "y" | "z"] = number;
    return null;
  }
  if (keyLower === "sx" || keyLower === "sy" || keyLower === "sz") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", `invalid number for ${key}`);
    object.transform.scale[keyLower[1] as "x" | "y" | "z"] = Math.max(0.001, number);
    return null;
  }
  if (keyLower === "opacity") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", "invalid opacity");
    object.material.opacity = clampNumber(number, 0, 1);
    return null;
  }
  if (keyLower === "roughness") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", "invalid roughness");
    object.material.roughness = clampNumber(number, 0, 1);
    return null;
  }
  if (keyLower === "metalness") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", "invalid metalness");
    object.material.metalness = clampNumber(number, 0, 1);
    return null;
  }
  if (keyLower === "color") {
    const color = parseScriptColor(value);
    if (color == null) return createSceneScriptDiagnostic(line, "invalid-color", `invalid color '${value}'`);
    object.material.color = color;
    return null;
  }
  if (keyLower === "visible") {
    const visible = parseScriptBool(value);
    if (visible == null) return createSceneScriptDiagnostic(line, "invalid-boolean", `invalid boolean '${value}'`);
    object.visible = visible;
    return null;
  }
  if (keyLower === "size" && object.type === "box") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", "invalid cube size");
    const size = clampNumber(number, 0.1, 10);
    object.params.width = size;
    object.params.height = size;
    object.params.depth = size;
    return null;
  }
  if (keyLower === "name") {
    object.name = value;
    return null;
  }
  if (keyLower === "group") {
    object.group = value || "default";
    return null;
  }

  const registry = GEOMETRY_OBJECT_REGISTRY[object.type];
  const paramDef = registry.params.find((param) => param.id.toLowerCase() === keyLower);
  const paramId = paramDef?.id ?? Object.keys(object.params).find((id) => id.toLowerCase() === keyLower);
  if (!paramId) return createSceneScriptDiagnostic(line, "unknown-field", `unknown field '${key}' for ${object.type}`);
  if (!paramDef) {
    object.params[paramId] = value;
    return null;
  }
  if (paramDef.kind === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return createSceneScriptDiagnostic(line, "invalid-number", `invalid number for ${paramId}`);
    object.params[paramId] = clampNumber(number, paramDef.min ?? -Infinity, paramDef.max ?? Infinity);
    return null;
  }
  if (paramDef.kind === "toggle") {
    const toggle = parseScriptBool(value);
    if (toggle == null) return createSceneScriptDiagnostic(line, "invalid-boolean", `invalid boolean for ${paramId}`);
    object.params[paramId] = toggle;
    return null;
  }
  object.params[paramId] = value;
  return null;
};

export const executeSceneScript = ({
  script,
  objects,
  datasetObjectIds = [],
  selectedObjectId = null,
}: ExecuteSceneScriptInput): SceneScriptExecutionResult => {
  const parsed = parseSceneScript(script);
  const parseDiagnosticByLine = new Map(parsed.diagnostics.map((entry) => [entry.line, entry]));
  const commandsByLine = new Map(parsed.commands.map((command) => [command.line, command]));
  const datasetIds = new Set(datasetObjectIds);

  const objectMap = new Map(objects.map((object) => [object.id, cloneGeometryObject(object)]));
  let selectedId = selectedObjectId && objectMap.has(selectedObjectId) ? selectedObjectId : null;
  let generatedIdCounter = objectMap.size + 1;
  const stats: SceneScriptExecutionStats = { created: 0, updated: 0, deleted: 0 };
  const createdObjectIds = new Set<string>();
  const updatedObjectIds = new Set<string>();
  const deletedObjectIds = new Set<string>();

  const fail = (error: SceneScriptDiagnostic): SceneScriptExecutionResult => ({
    ok: false,
    commands: parsed.commands,
    diagnostics: [error],
    error,
  });
  const nextGeneratedId = () => {
    while (true) {
      const candidate = `obj_${generatedIdCounter++}`;
      if (!objectMap.has(candidate) && !datasetIds.has(candidate)) return candidate;
    }
  };
  const lineCount = script.split(/\r?\n/).length;

  for (let line = 1; line <= lineCount; line += 1) {
    const parseError = parseDiagnosticByLine.get(line);
    const command = commandsByLine.get(line);
    if (!command) {
      if (parseError) return fail(parseError);
      continue;
    }

    if (command.kind === "clear") {
      for (const id of objectMap.keys()) deletedObjectIds.add(id);
      objectMap.clear();
      selectedId = null;
      continue;
    }

    if (command.kind === "add") {
      const objectType = resolveScriptObjectType(command.objectType);
      if (!objectType) {
        return fail(createSceneScriptDiagnostic(command.line, "unknown-object-type", `unknown object type '${command.objectType}'`));
      }
      const id = command.id || nextGeneratedId();
      if (objectMap.has(id) || datasetIds.has(id)) {
        return fail(createSceneScriptDiagnostic(command.line, "duplicate-object-id", `id '${id}' already exists`));
      }
      if (parseError) return fail(parseError);
      const object = createGeometryObject(objectType, id);
      if (command.objectType.trim().toLowerCase() === "cube") {
        const size = Number(object.params.width ?? 1.6);
        object.params.height = size;
        object.params.depth = size;
        object.name = "Cube";
      }
      for (const assignment of command.assignments) {
        const error = applyAssignment(object, assignment, command.line);
        if (error) return fail(error);
      }
      objectMap.set(id, object);
      createdObjectIds.add(id);
      deletedObjectIds.delete(id);
      selectedId = id;
      stats.created += 1;
      continue;
    }

    const object = objectMap.get(command.id);
    if (!object) return fail(createSceneScriptDiagnostic(command.line, "object-not-found", `object '${command.id}' not found`));
    if (parseError) return fail(parseError);

    if (command.kind === "set") {
      for (const assignment of command.assignments) {
        const error = applyAssignment(object, assignment, command.line);
        if (error) return fail(error);
      }
      stats.updated += 1;
      updatedObjectIds.add(command.id);
      continue;
    }
    if (command.kind === "delete") {
      objectMap.delete(command.id);
      deletedObjectIds.add(command.id);
      createdObjectIds.delete(command.id);
      updatedObjectIds.delete(command.id);
      if (selectedId === command.id) selectedId = null;
      stats.deleted += 1;
      continue;
    }
    if (command.kind === "setVisibility") {
      object.visible = command.visible;
      stats.updated += 1;
      updatedObjectIds.add(command.id);
      continue;
    }
    selectedId = command.id;
  }

  const nextObjects = Array.from(objectMap.values());
  return {
    ok: true,
    commands: parsed.commands,
    diagnostics: [],
    objects: nextObjects,
    selectedObjectId: selectedId ?? nextObjects[0]?.id ?? null,
    stats,
    changes: {
      createdObjectIds: Array.from(createdObjectIds),
      updatedObjectIds: Array.from(updatedObjectIds),
      deletedObjectIds: Array.from(deletedObjectIds),
    },
  };
};
