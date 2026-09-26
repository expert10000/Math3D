import { MAX_SCENE_OBJECT_BYTES } from "@math3d/core";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import type { MobileStoredSceneProject } from "../models/mobileScene";
import {
  validateMobileSemanticObjectArtifact,
  type MobileObjectExportArtifact,
} from "../models/mobileObjectExport";
import { listMobileGltfDependencies, MAX_MOBILE_MESH_IMPORT_BYTES, type MobileMeshImportSource } from "../models/mobileMeshImport";
import {
  createMobileProjectExportName,
  validateMobileProjectForTransfer,
} from "../models/mobileProjectTransfer";

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const JSON_MIME_TYPE = "application/json";
const exportCacheDirectory = new Directory(Paths.cache, "math3d-mobile-exports");

export type MobileProjectPickResult =
  | { status: "selected"; serializedProject: string; sourceName: string }
  | { status: "cancelled" };

export type MobileSceneObjectPickResult =
  | { status: "selected"; serializedObject: string; sourceName: string }
  | { status: "cancelled" };

export type MobileMeshPickResult =
  | { status: "selected"; source: MobileMeshImportSource }
  | { status: "cancelled" };

export type MobileProjectExportResult =
  | { status: "exported"; fileName: string }
  | { status: "cancelled" };

export type MobileObjectArtifactExportResult =
  | { status: "exported"; fileName: string }
  | { status: "cancelled" };

const pickerWasCancelled = (error: unknown): boolean =>
  String((error as Error)?.message ?? error).toLocaleLowerCase().includes("picker was cancelled");

const fileNameFromUri = (uri: string): string => {
  const finalSegment = uri.split("/").filter(Boolean).at(-1);
  if (!finalSegment) return "selected project";
  try {
    return decodeURIComponent(finalSegment);
  } catch {
    return finalSegment;
  }
};

export const pickMobileSceneProject = async (): Promise<MobileProjectPickResult> => {
  try {
    const selected = await File.pickFileAsync(undefined, JSON_MIME_TYPE);
    const file = Array.isArray(selected) ? selected[0] : selected;
    if (!file) return { status: "cancelled" };
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error("The selected project is larger than the 25 MB mobile import limit.");
    }
    return {
      status: "selected",
      serializedProject: await file.text(),
      sourceName: fileNameFromUri(file.uri),
    };
  } catch (error) {
    if (pickerWasCancelled(error)) return { status: "cancelled" };
    throw error;
  }
};

export const pickMobileSceneObject = async (): Promise<MobileSceneObjectPickResult> => {
  try {
    const selected = await File.pickFileAsync(undefined, JSON_MIME_TYPE);
    const file = Array.isArray(selected) ? selected[0] : selected;
    if (!file) return { status: "cancelled" };
    if (file.size > MAX_SCENE_OBJECT_BYTES) {
      throw new Error(`The selected object is larger than the ${MAX_SCENE_OBJECT_BYTES / (1024 * 1024)} MB mobile import limit.`);
    }
    return {
      status: "selected",
      serializedObject: await file.text(),
      sourceName: fileNameFromUri(file.uri),
    };
  } catch (error) {
    if (pickerWasCancelled(error)) return { status: "cancelled" };
    throw error;
  }
};

export const pickMobileMeshFile = async (): Promise<MobileMeshPickResult> => {
  try {
    const selected = await File.pickFileAsync();
    const file = Array.isArray(selected) ? selected[0] : selected;
    if (!file) return { status: "cancelled" };
    if (file.size > MAX_MOBILE_MESH_IMPORT_BYTES) {
      throw new Error(`The selected mesh is larger than the ${MAX_MOBILE_MESH_IMPORT_BYTES / (1024 * 1024)} MB mobile import limit.`);
    }
    const sourceName = fileNameFromUri(file.uri);
    const source: MobileMeshImportSource = { sourceName, bytes: await file.bytes() };
    const extension = sourceName.split(".").at(-1)?.toLocaleLowerCase();
    if (extension !== "gltf" && extension !== "glb") return { status: "selected", source };
    const dependencyUris = listMobileGltfDependencies(source);
    if (dependencyUris.length === 0) return { status: "selected", source };
    const directory = await Directory.pickDirectoryAsync();
    const dependencies: Record<string, Uint8Array> = {};
    let totalBytes = source.bytes.byteLength;
    for (const uri of dependencyUris) {
      const decodedPath = decodeURIComponent(uri);
      const dependency = new File(directory.uri, ...decodedPath.split("/"));
      if (!dependency.exists) throw new Error(`The selected glTF package is missing '${uri}'.`);
      totalBytes += dependency.size;
      if (totalBytes > MAX_MOBILE_MESH_IMPORT_BYTES) throw new Error("The selected glTF package exceeds the 32 MB mobile import limit.");
      dependencies[uri] = await dependency.bytes();
    }
    return { status: "selected", source: { ...source, dependencies } };
  } catch (error) {
    if (pickerWasCancelled(error)) return { status: "cancelled" };
    throw error;
  }
};

const validatedExport = (project: MobileStoredSceneProject) => {
  const validated = validateMobileProjectForTransfer(project);
  if (!validated.ok) throw new Error(validated.error);
  return validated.serializedProject;
};

export const exportMobileSceneProject = async (
  project: MobileStoredSceneProject
): Promise<MobileProjectExportResult> => {
  const serializedProject = validatedExport(project);
  try {
    const directory = await Directory.pickDirectoryAsync();
    const fileName = createMobileProjectExportName(project);
    const output = directory.createFile(fileName, JSON_MIME_TYPE);
    output.write(serializedProject, { encoding: "utf8" });
    if ((await output.text()) !== serializedProject) {
      throw new Error("The exported file could not be verified.");
    }
    return { status: "exported", fileName };
  } catch (error) {
    if (pickerWasCancelled(error)) return { status: "cancelled" };
    throw error;
  }
};

export const shareMobileSceneProject = async (project: MobileStoredSceneProject): Promise<void> => {
  if (!(await isAvailableAsync())) throw new Error("Native sharing is unavailable on this device.");
  const serializedProject = validatedExport(project);
  exportCacheDirectory.create({ idempotent: true, intermediates: true });
  const file = new File(exportCacheDirectory, createMobileProjectExportName(project));
  if (file.exists) file.delete();
  file.create({ intermediates: true, overwrite: true });
  file.write(serializedProject, { encoding: "utf8" });
  await shareAsync(file.uri, {
    dialogTitle: `Share ${project.title}`,
    mimeType: JSON_MIME_TYPE,
    UTI: "public.json",
  });
};

const collisionSuffix = (fileName: string, suffix: number): string => {
  if (suffix === 0) return fileName;
  const dot = fileName.lastIndexOf(".");
  return dot < 0
    ? `${fileName}-${suffix + 1}`
    : `${fileName.slice(0, dot)}-${suffix + 1}${fileName.slice(dot)}`;
};

const verifiedArtifactContent = (artifact: MobileObjectExportArtifact): string => {
  if (artifact.semantic) validateMobileSemanticObjectArtifact(artifact);
  if (!artifact.content) throw new Error("The prepared object export is empty.");
  return artifact.content;
};

export const exportMobileObjectArtifact = async (
  artifact: MobileObjectExportArtifact
): Promise<MobileObjectArtifactExportResult> => {
  const content = verifiedArtifactContent(artifact);
  try {
    const directory = await Directory.pickDirectoryAsync();
    let suffix = 0;
    let fileName = artifact.fileName;
    while (new File(directory.uri, fileName).exists) {
      suffix += 1;
      if (suffix > 999) throw new Error("Could not create a unique export file name.");
      fileName = collisionSuffix(artifact.fileName, suffix);
    }
    const output = directory.createFile(fileName, artifact.mimeType);
    output.write(content, { encoding: "utf8" });
    const readBack = await output.text();
    if (readBack !== content) throw new Error("The exported file could not be verified.");
    if (artifact.semantic) validateMobileSemanticObjectArtifact({ ...artifact, content: readBack });
    return { status: "exported", fileName };
  } catch (error) {
    if (pickerWasCancelled(error)) return { status: "cancelled" };
    throw error;
  }
};

export const shareMobileObjectArtifact = async (artifact: MobileObjectExportArtifact): Promise<void> => {
  if (!(await isAvailableAsync())) throw new Error("Native sharing is unavailable on this device.");
  const content = verifiedArtifactContent(artifact);
  exportCacheDirectory.create({ idempotent: true, intermediates: true });
  const file = new File(exportCacheDirectory, artifact.fileName);
  if (file.exists) file.delete();
  file.create({ intermediates: true, overwrite: true });
  file.write(content, { encoding: "utf8" });
  const readBack = await file.text();
  if (readBack !== content) throw new Error("The shared file could not be verified.");
  if (artifact.semantic) validateMobileSemanticObjectArtifact({ ...artifact, content: readBack });
  await shareAsync(file.uri, {
    dialogTitle: `Share ${artifact.objectId} as ${artifact.formatLabel}`,
    mimeType: artifact.mimeType,
    UTI: artifact.uti,
  });
};
