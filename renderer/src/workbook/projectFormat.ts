import type { SceneDocument } from "@math3d/core";

export const WORKBOOK_PROJECT_FORMAT_VERSION = 3 as const;
export const WORKBOOK_PROJECT_FORMAT = "math3d-project" as const;
export const WORKBOOK_PROJECT_EXTENSION = ".math3d" as const;

export type WorkbookBundleAssetMode = "embedded" | "linked";

export type WorkbookReplayPayloadLike = {
  workbooks: unknown[];
  activeWorkbookId?: unknown;
  activeStageId?: unknown;
  workspace?: unknown;
};

export type WorkbookProjectEnvelopeV2 = {
  version: 2;
  format: typeof WORKBOOK_PROJECT_FORMAT;
  extension: typeof WORKBOOK_PROJECT_EXTENSION;
  savedAt: number;
  assetMode: WorkbookBundleAssetMode;
  payload: WorkbookReplayPayloadLike;
};

export type WorkbookProjectEnvelopeV3 = {
  version: typeof WORKBOOK_PROJECT_FORMAT_VERSION;
  format: typeof WORKBOOK_PROJECT_FORMAT;
  extension: typeof WORKBOOK_PROJECT_EXTENSION;
  savedAt: number;
  assetMode: WorkbookBundleAssetMode;
  payload: WorkbookReplayPayloadLike;
  sceneDocument?: SceneDocument;
};

export type WorkbookProjectEnvelopeV1 = {
  version: 1;
  format: "math3d-bundle";
  extension: ".math3d";
  savedAt: number;
  assetMode: WorkbookBundleAssetMode;
  payload: WorkbookReplayPayloadLike;
};

export type ParsedWorkbookProject = {
  payload: WorkbookReplayPayloadLike;
  assetMode: WorkbookBundleAssetMode;
  sourceVersion: 0 | 1 | 2 | 3;
  sceneDocument?: SceneDocument;
};

export const isWorkbookReplayPayloadLike = (value: unknown): value is WorkbookReplayPayloadLike => {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as WorkbookReplayPayloadLike).workbooks);
};

export const isWorkbookProjectEnvelopeV3 = (value: unknown): value is WorkbookProjectEnvelopeV3 => {
  if (!value || typeof value !== "object") return false;
  const env = value as WorkbookProjectEnvelopeV3;
  return (
    env.version === WORKBOOK_PROJECT_FORMAT_VERSION &&
    env.format === WORKBOOK_PROJECT_FORMAT &&
    env.extension === WORKBOOK_PROJECT_EXTENSION &&
    isWorkbookReplayPayloadLike(env.payload)
  );
};

export const isWorkbookProjectEnvelopeV2 = (value: unknown): value is WorkbookProjectEnvelopeV2 => {
  if (!value || typeof value !== "object") return false;
  const env = value as WorkbookProjectEnvelopeV2;
  return (
    env.version === 2 &&
    env.format === WORKBOOK_PROJECT_FORMAT &&
    env.extension === WORKBOOK_PROJECT_EXTENSION &&
    isWorkbookReplayPayloadLike(env.payload)
  );
};

export const isWorkbookProjectEnvelopeV1 = (value: unknown): value is WorkbookProjectEnvelopeV1 => {
  if (!value || typeof value !== "object") return false;
  const env = value as WorkbookProjectEnvelopeV1;
  return (
    env.version === 1 &&
    env.format === "math3d-bundle" &&
    env.extension === WORKBOOK_PROJECT_EXTENSION &&
    isWorkbookReplayPayloadLike(env.payload)
  );
};

export const parseWorkbookProject = (raw: unknown): ParsedWorkbookProject | null => {
  if (isWorkbookProjectEnvelopeV3(raw)) {
    return {
      payload: raw.payload,
      assetMode: raw.assetMode === "linked" ? "linked" : "embedded",
      sourceVersion: 3,
      sceneDocument: raw.sceneDocument,
    };
  }
  if (isWorkbookProjectEnvelopeV2(raw)) {
    return {
      payload: raw.payload,
      assetMode: raw.assetMode === "linked" ? "linked" : "embedded",
      sourceVersion: 2,
    };
  }
  if (isWorkbookProjectEnvelopeV1(raw)) {
    return {
      payload: raw.payload,
      assetMode: raw.assetMode === "linked" ? "linked" : "embedded",
      sourceVersion: 1,
    };
  }
  if (raw && typeof raw === "object" && isWorkbookReplayPayloadLike((raw as any).payload)) {
    const wrapped = (raw as any).payload as WorkbookReplayPayloadLike;
    return {
      payload: wrapped,
      assetMode: "embedded",
      sourceVersion: 1,
    };
  }
  if (Array.isArray(raw)) {
    return {
      payload: { workbooks: raw },
      assetMode: "embedded",
      sourceVersion: 0,
    };
  }
  if (isWorkbookReplayPayloadLike(raw)) {
    return {
      payload: raw,
      assetMode: "embedded",
      sourceVersion: 0,
    };
  }
  return null;
};

export const buildWorkbookProjectEnvelope = (
  payload: WorkbookReplayPayloadLike,
  assetMode: WorkbookBundleAssetMode,
  savedAt: number,
  sceneDocument?: SceneDocument
): WorkbookProjectEnvelopeV3 => ({
  version: WORKBOOK_PROJECT_FORMAT_VERSION,
  format: WORKBOOK_PROJECT_FORMAT,
  extension: WORKBOOK_PROJECT_EXTENSION,
  savedAt,
  assetMode,
  payload,
  ...(sceneDocument ? { sceneDocument } : {}),
});
