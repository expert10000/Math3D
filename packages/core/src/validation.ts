import { isFiniteNumber, isVec3 } from "./math";
import {
  SCENE_DOCUMENT_EXTENSION_KEY,
  SCENE_DOCUMENT_EXTENSION_VERSION,
  type SceneDocument,
} from "./sceneDocument";
import type { GeometryObject, GeometryScene } from "./sceneObjects";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const hasString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const validateGeometryScene = (value: unknown, errors: string[], path: string): value is GeometryScene => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  const checkPointList = (field: string) => {
    const list = value[field];
    if (list === undefined) return;
    if (!Array.isArray(list)) {
      errors.push(`${path}.${field} must be an array when provided.`);
      return;
    }
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (!isRecord(entry) || !isFiniteNumber(entry.x) || !isFiniteNumber(entry.y) || !isFiniteNumber(entry.z)) {
        errors.push(`${path}.${field}[${i}] must be a point-like object {x,y,z}.`);
      }
    }
  };
  checkPointList("points");
  return errors.length === 0;
};

const validateGeometryObject = (value: unknown, errors: string[], path: string): value is GeometryObject => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  if (!hasString(value.id)) errors.push(`${path}.id is required.`);
  if (!hasString(value.type)) errors.push(`${path}.type is required.`);
  if (!isRecord(value.params)) errors.push(`${path}.params must be an object.`);
  if (!isRecord(value.material)) errors.push(`${path}.material must be an object.`);
  if (!isRecord(value.transform)) {
    errors.push(`${path}.transform must be an object.`);
  } else {
    if (!isVec3(value.transform.position)) errors.push(`${path}.transform.position must be a Vec3.`);
    if (!isVec3(value.transform.rotation)) errors.push(`${path}.transform.rotation must be a Vec3.`);
    if (!isVec3(value.transform.scale)) errors.push(`${path}.transform.scale must be a Vec3.`);
  }
  return errors.length === 0;
};

const validateSceneDocumentExtension = (value: unknown, errors: string[], path: string) => {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (value.version !== SCENE_DOCUMENT_EXTENSION_VERSION) {
    errors.push(`${path}.version must be ${SCENE_DOCUMENT_EXTENSION_VERSION}.`);
  }
  if (value.scripts !== undefined) {
    if (!Array.isArray(value.scripts)) {
      errors.push(`${path}.scripts must be an array when provided.`);
    } else {
      for (let i = 0; i < value.scripts.length; i += 1) {
        const script = value.scripts[i];
        if (!isRecord(script)) {
          errors.push(`${path}.scripts[${i}] must be an object.`);
          continue;
        }
        if (!hasString(script.id)) errors.push(`${path}.scripts[${i}].id is required.`);
        if (!hasString(script.kind)) errors.push(`${path}.scripts[${i}].kind is required.`);
        if (!hasString(script.language)) errors.push(`${path}.scripts[${i}].language is required.`);
        if (typeof script.source !== "string") errors.push(`${path}.scripts[${i}].source must be a string.`);
      }
    }
  }
};

export const validateSceneDocument = (value: unknown): ValidationResult<SceneDocument> => {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["Scene document must be an object."] };
  }
  if (!hasString(value.id)) errors.push("scene.id is required.");
  if (!hasString(value.title)) errors.push("scene.title is required.");
  if (!isFiniteNumber(value.createdAt)) errors.push("scene.createdAt must be a finite number.");
  if (!isFiniteNumber(value.updatedAt)) errors.push("scene.updatedAt must be a finite number.");

  if (value.geometry !== undefined) {
    validateGeometryScene(value.geometry, errors, "scene.geometry");
  }

  if (value.objects !== undefined) {
    if (!Array.isArray(value.objects)) {
      errors.push("scene.objects must be an array.");
    } else {
      for (let i = 0; i < value.objects.length; i += 1) {
        validateGeometryObject(value.objects[i], errors, `scene.objects[${i}]`);
      }
    }
  }

  if (value.cameras !== undefined) {
    if (!Array.isArray(value.cameras)) {
      errors.push("scene.cameras must be an array.");
    } else {
      for (let i = 0; i < value.cameras.length; i += 1) {
        const camera = value.cameras[i];
        if (!isRecord(camera)) {
          errors.push(`scene.cameras[${i}] must be an object.`);
          continue;
        }
        if (!hasString(camera.id)) errors.push(`scene.cameras[${i}].id is required.`);
        if (!hasString(camera.name)) errors.push(`scene.cameras[${i}].name is required.`);
        if (!isVec3(camera.position)) errors.push(`scene.cameras[${i}].position must be Vec3.`);
        if (!isVec3(camera.target)) errors.push(`scene.cameras[${i}].target must be Vec3.`);
      }
    }
  }

  if (value.extensions !== undefined) {
    if (!isRecord(value.extensions)) {
      errors.push("scene.extensions must be an object.");
    } else {
      validateSceneDocumentExtension(
        value.extensions[SCENE_DOCUMENT_EXTENSION_KEY],
        errors,
        `scene.extensions.${SCENE_DOCUMENT_EXTENSION_KEY}`
      );
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as SceneDocument };
};
