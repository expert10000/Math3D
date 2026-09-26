import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSceneProjectDocument, serializeSceneProject, type SceneDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";

const fileContents = vi.hoisted(() => new Map<string, string>());
const fileFaults = vi.hoisted(() => ({ writePath: "", moveDestination: "" }));

vi.mock("expo-file-system", () => {
  class Directory {
    readonly uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => typeof part === "string" ? part : part.uri).join("/");
    }
    create() {}
  }

  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => typeof part === "string" ? part : part.uri).join("/");
    }
    get exists() { return fileContents.has(this.uri); }
    create() { fileContents.set(this.uri, ""); }
    async text() { return fileContents.get(this.uri) ?? ""; }
    write(value: string) {
      if (fileFaults.writePath === this.uri) throw new Error("ENOSPC: no space left on device");
      fileContents.set(this.uri, value);
    }
    delete() { fileContents.delete(this.uri); }
    copy(destination: File) { fileContents.set(destination.uri, fileContents.get(this.uri) ?? ""); }
    move(destination: File) {
      if (fileFaults.moveDestination === destination.uri) {
        fileFaults.moveDestination = "";
        throw new Error("simulated rename failure");
      }
      fileContents.set(destination.uri, fileContents.get(this.uri) ?? "");
      fileContents.delete(this.uri);
      this.uri = destination.uri;
    }
  }

  return { Directory, File, Paths: { document: "documents" } };
});

import {
  MOBILE_SCENE_STORAGE_SCHEMA_VERSION,
  MobileSceneStorageError,
  decodeMobileSceneStorage,
  describeMobileSceneStorageError,
  loadStoredSceneProjects,
  resolveMobileSceneStorage,
  saveStoredSceneProjects,
} from "../../apps/mobile/src/services/mobileSceneStorage";

const scene: SceneDocument = {
  id: "stored-saddle",
  title: "Stored saddle",
  createdAt: 1,
  updatedAt: 2,
  surfaces: [{
    id: "surface-saddle",
    kind: "explicit",
    expression: "x*x-y*y",
    resolution: 18,
    domain: { xSpan: 2, ySpan: 2 },
  }],
};

const project: MobileStoredSceneProject = {
  id: scene.id,
  title: scene.title,
  updatedAt: scene.updatedAt,
  lastOpenedAt: 3,
  serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
};

const payload = (projects: MobileStoredSceneProject[] = [project]) => JSON.stringify({
  schemaVersion: MOBILE_SCENE_STORAGE_SCHEMA_VERSION,
  projects,
});

describe("mobile scene storage recovery", () => {
  beforeEach(() => {
    fileContents.clear();
    fileFaults.writePath = "";
    fileFaults.moveDestination = "";
  });

  it("migrates the legacy project-array payload", () => {
    const decoded = decodeMobileSceneStorage(JSON.stringify([project]));
    expect(decoded).toMatchObject({ ok: true, migrated: true, projects: [project] });
  });

  it("preserves source metadata in the one project record and rejects malformed provenance", () => {
    const sourced = { ...project, source: {
      kind: "shared" as const,
      name: "received.math3d.scene.json",
      sourceProjectId: "desktop-source",
      importedAt: 10,
    } };
    expect(decodeMobileSceneStorage(payload([sourced]))).toMatchObject({ ok: true, projects: [sourced] });
    expect(decodeMobileSceneStorage(payload([{ ...sourced, source: { ...sourced.source, importedAt: -1 } }]))).toMatchObject({
      ok: false, issues: [expect.stringContaining("source is invalid")],
    });
  });

  it("rejects unsupported schemas and inconsistent scene metadata", () => {
    expect(decodeMobileSceneStorage(JSON.stringify({ schemaVersion: 99, projects: [project] }))).toMatchObject({
      ok: false,
      issues: [expect.stringContaining("Unsupported project storage schema 99")],
    });
    expect(decodeMobileSceneStorage(payload([{ ...project, title: "Wrong wrapper title" }]))).toMatchObject({
      ok: false,
      issues: [expect.stringContaining("title does not match")],
    });
  });

  it("selects a valid backup when the primary file is truncated", () => {
    const resolved = resolveMobileSceneStorage('{"schemaVersion":1,"projects":', payload());
    expect(resolved.source).toBe("backup");
    expect(resolved.rewritePrimary).toBe(true);
    expect(resolved.projects).toEqual([project]);
    expect(resolved.issues[0]).toContain("recovered from the last valid backup");
  });

  it("does not treat invalid storage without a backup as an empty first run", () => {
    const resolved = resolveMobileSceneStorage('{"schemaVersion":99,"projects":[]}', null);
    expect(resolved).toMatchObject({ source: "invalid", projects: [], rewritePrimary: false });
  });

  it("keeps a backup and restores projects after primary corruption", async () => {
    await saveStoredSceneProjects([project]);
    await saveStoredSceneProjects([{ ...project, lastOpenedAt: 4 }]);
    fileContents.set("documents/math3d-mobile/scene-projects.json", "{truncated");

    const loaded = await loadStoredSceneProjects();

    expect(loaded.source).toBe("backup");
    expect(loaded.projects).toEqual([project]);
    expect(decodeMobileSceneStorage(fileContents.get("documents/math3d-mobile/scene-projects.json") ?? "").ok).toBe(true);
  });

  it("restores the previous file when the final temporary-file rename fails", async () => {
    await saveStoredSceneProjects([project]);
    expect(decodeMobileSceneStorage(fileContents.get("documents/math3d-mobile/scene-projects.backup.json") ?? "").ok).toBe(true);
    fileFaults.moveDestination = "documents/math3d-mobile/scene-projects.json";

    await expect(saveStoredSceneProjects([{ ...project, lastOpenedAt: 9 }])).rejects.toMatchObject({
      code: "write-failed",
    });

    const restored = decodeMobileSceneStorage(fileContents.get("documents/math3d-mobile/scene-projects.json") ?? "");
    expect(restored).toMatchObject({ ok: true, projects: [project] });
    expect(fileContents.has("documents/math3d-mobile/scene-projects.backup.json")).toBe(true);
  });

  it("classifies a temporary-file write failure as storage full", async () => {
    await saveStoredSceneProjects([project]);
    fileFaults.writePath = "documents/math3d-mobile/scene-projects.tmp";
    await expect(saveStoredSceneProjects([{ ...project, lastOpenedAt: 10 }])).rejects.toMatchObject({ code: "storage-full" });
    expect(decodeMobileSceneStorage(fileContents.get("documents/math3d-mobile/scene-projects.json") ?? ""))
      .toMatchObject({ ok: true, projects: [project] });
  });

  it("reports storage-full and validation failures with actionable messages", () => {
    expect(describeMobileSceneStorageError(new Error("ENOSPC: no space left on device"))).toContain("storage is full");
    expect(describeMobileSceneStorageError(new MobileSceneStorageError("validation", "bad project"))).toContain("failed validation");
  });
});
