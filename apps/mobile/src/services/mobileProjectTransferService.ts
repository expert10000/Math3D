import { MAX_SCENE_OBJECT_BYTES } from "@math3d/core";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import type { MobileStoredSceneProject } from "../models/mobileScene";
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

export type MobileProjectExportResult =
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
