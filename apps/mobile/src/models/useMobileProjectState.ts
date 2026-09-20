import { useState } from "react";
import type { MobileStoredSceneProject } from "./mobileScene";

export type StorageStatus = "loading" | "ready" | "error";
export type SceneSortMode = "recent" | "updated" | "title";

export const useMobileProjectState = () => {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [storedProjects, setStoredProjects] = useState<MobileStoredSceneProject[]>([]);
  const [storageIssues, setStorageIssues] = useState<string[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading");
  const [sceneSearchQuery, setSceneSearchQuery] = useState("");
  const [sceneSortMode, setSceneSortMode] = useState<SceneSortMode>("recent");
  return {
    selectedSceneId, setSelectedSceneId, storedProjects, setStoredProjects, storageIssues, setStorageIssues,
    storageStatus, setStorageStatus, sceneSearchQuery, setSceneSearchQuery, sceneSortMode, setSceneSortMode,
  };
};
