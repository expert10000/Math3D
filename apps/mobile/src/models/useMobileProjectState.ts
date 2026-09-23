import { useState } from "react";
import type { MobileStoredSceneProject } from "./mobileScene";
import type { MobileSceneThumbnail } from "../viewer/mobileSceneThumbnail";

export type StorageStatus = "loading" | "ready" | "error";
export type SceneSortMode = "recent" | "updated" | "title";

export const useMobileProjectState = () => {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [storedProjects, setStoredProjects] = useState<MobileStoredSceneProject[]>([]);
  const [storageIssues, setStorageIssues] = useState<string[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [sceneSearchQuery, setSceneSearchQuery] = useState("");
  const [sceneSortMode, setSceneSortMode] = useState<SceneSortMode>("recent");
  const [deletedProject, setDeletedProject] = useState<MobileStoredSceneProject | null>(null);
  const [projectActionMessage, setProjectActionMessage] = useState("");
  const [sceneThumbnailsById, setSceneThumbnailsById] = useState<Record<string, MobileSceneThumbnail | undefined>>({});
  return {
    selectedSceneId, setSelectedSceneId, storedProjects, setStoredProjects, storageIssues, setStorageIssues,
    storageStatus, setStorageStatus, sceneSearchQuery, setSceneSearchQuery, sceneSortMode, setSceneSortMode,
    deletedProject, setDeletedProject, projectActionMessage, setProjectActionMessage,
    sceneThumbnailsById, setSceneThumbnailsById,
  };
};
