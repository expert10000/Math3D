import {
  MAX_SCENE_OBJECT_BYTES,
  deserializeSceneObjectEnvelope,
  type SceneDocument,
  type SceneObjectEnvelope,
  type SceneObjectTransform,
  type SurfaceDefinition,
} from "@math3d/core";
import { createUniqueMobileSceneObjectId } from "./mobileSceneObjectOperations";

export const MOBILE_SCENE_OBJECT_IMPORTS_EXTENSION = "math3d.scene-object.imports.v1";

export type MobileImportedSceneObjectRecord = Readonly<{
  importedAt: number;
  sourceName: string;
  envelope: SceneObjectEnvelope;
}>;

export type MobileImportedObjectPresentation = Readonly<{
  visible: boolean;
  opacity?: number;
  color?: string;
  transform: SceneObjectTransform;
}>;

export type MobileSceneObjectImportPreview = Readonly<{
  envelope: SceneObjectEnvelope;
  sourceName: string;
  sourceVersion: number;
  migrated: boolean;
  destinationObjectId: string;
  hasIdentityCollision: boolean;
  definitionSummary: string;
  analysisMetadataKeys: readonly string[];
}>;

export type MobileSceneObjectImportPreparation =
  | { status: "ready"; preview: MobileSceneObjectImportPreview }
  | { status: "cancelled" }
  | { status: "error"; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
};

const definitionSummary = (definition: SurfaceDefinition): string => {
  if (definition.kind === "explicit") return `z = ${definition.expression}`;
  if (definition.kind === "implicit") return `${definition.expression} = 0`;
  if (definition.kind === "parametric") return `(${definition.xExpr}, ${definition.yExpr}, ${definition.zExpr})`;
  if (definition.kind === "weierstrass") return `g(z) = ${definition.gExpr}; phi(z) = ${definition.phiExpr}`;
  return `Mesh from ${definition.source}`;
};

const cleanSourceName = (sourceName: string): string => sourceName
  .trim()
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .slice(0, 240) || "Math3D object";

export const prepareMobileSceneObjectImport = (
  serializedObject: string | null,
  sourceName: string,
  destinationScene: SceneDocument,
  maxBytes = MAX_SCENE_OBJECT_BYTES
): MobileSceneObjectImportPreparation => {
  if (serializedObject === null) return { status: "cancelled" };
  if (utf8ByteLength(serializedObject) > maxBytes) {
    return { status: "error", error: `The selected object is larger than the ${Math.floor(maxBytes / (1024 * 1024))} MB mobile import limit.` };
  }
  const parsed = deserializeSceneObjectEnvelope(serializedObject);
  if (!parsed.ok) return { status: "error", error: `Invalid Math3D object: ${parsed.errors.join("; ")}` };
  if (parsed.value.object.kind === "mesh") {
    return { status: "error", error: "Mesh scene objects use the bounded mesh importer introduced in MOB60." };
  }
  const destinationObjectId = createUniqueMobileSceneObjectId(destinationScene, parsed.value.object.id);
  return {
    status: "ready",
    preview: {
      envelope: parsed.value,
      sourceName: cleanSourceName(sourceName),
      sourceVersion: parsed.sourceVersion,
      migrated: parsed.migrated,
      destinationObjectId,
      hasIdentityCollision: destinationObjectId !== parsed.value.object.id,
      definitionSummary: definitionSummary(parsed.value.object.definition),
      analysisMetadataKeys: Object.keys(parsed.value.analysisMetadata).sort(),
    },
  };
};

const importedRecords = (scene: SceneDocument): Record<string, MobileImportedSceneObjectRecord> => {
  const value = scene.extensions?.[MOBILE_SCENE_OBJECT_IMPORTS_EXTENSION];
  if (!isRecord(value)) return {};
  return value as Record<string, MobileImportedSceneObjectRecord>;
};

export const addMobileSceneObjectImportToScene = (
  scene: SceneDocument,
  preview: MobileSceneObjectImportPreview,
  now = Date.now()
): { scene: SceneDocument; objectId: string; presentation: MobileImportedObjectPresentation } => {
  const objectId = createUniqueMobileSceneObjectId(scene, preview.envelope.object.id);
  const definition = { ...preview.envelope.object.definition, id: objectId } as SurfaceDefinition;
  const record: MobileImportedSceneObjectRecord = {
    importedAt: now,
    sourceName: cleanSourceName(preview.sourceName),
    envelope: preview.envelope,
  };
  return {
    objectId,
    scene: {
      ...scene,
      updatedAt: now,
      surfaces: [...(scene.surfaces ?? []), definition],
      extensions: {
        ...(scene.extensions ?? {}),
        [MOBILE_SCENE_OBJECT_IMPORTS_EXTENSION]: {
          ...importedRecords(scene),
          [objectId]: record,
        },
      },
    },
    presentation: {
      visible: preview.envelope.object.visible,
      ...(preview.envelope.object.style.opacity === undefined ? {} : { opacity: preview.envelope.object.style.opacity }),
      ...(preview.envelope.object.style.color === undefined ? {} : { color: preview.envelope.object.style.color }),
      transform: preview.envelope.object.transform,
    },
  };
};

export const readMobileImportedSceneObject = (
  scene: SceneDocument,
  objectId: string
): MobileImportedSceneObjectRecord | null => {
  const record = importedRecords(scene)[objectId];
  if (!isRecord(record) || !isRecord(record.envelope)) return null;
  let parsed: ReturnType<typeof deserializeSceneObjectEnvelope>;
  try {
    parsed = deserializeSceneObjectEnvelope(JSON.stringify(record.envelope));
  } catch {
    return null;
  }
  if (!parsed.ok) return null;
  return {
    importedAt: typeof record.importedAt === "number" && Number.isFinite(record.importedAt) ? record.importedAt : 0,
    sourceName: typeof record.sourceName === "string" ? record.sourceName : "Math3D object",
    envelope: parsed.value,
  };
};

export const readMobileImportedObjectPresentations = (
  scene: SceneDocument
): Record<string, MobileImportedObjectPresentation> => Object.fromEntries(
  Object.keys(importedRecords(scene)).flatMap((objectId) => {
    const record = readMobileImportedSceneObject(scene, objectId);
    if (!record) return [];
    const { visible, style, transform } = record.envelope.object;
    return [[objectId, {
      visible,
      ...(style.opacity === undefined ? {} : { opacity: style.opacity }),
      ...(style.color === undefined ? {} : { color: style.color }),
      transform,
    } satisfies MobileImportedObjectPresentation]];
  })
);
