import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSceneProjectDocument, serializeSceneProject, type SceneDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import { createMobileGraph, storeMobileGraph, readMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";

const fileContents = vi.hoisted(() => new Map<string, string>());
const fileFaults = vi.hoisted(() => ({ writePath: "", moveDestination: "", readPath: "", deletePath: "" }));

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
    async text() {
      if (fileFaults.readPath === this.uri) throw new Error("simulated read failure");
      return fileContents.get(this.uri) ?? "";
    }
    write(value: string) {
      if (fileFaults.writePath === this.uri) throw new Error("ENOSPC: no space left on device");
      fileContents.set(this.uri, value);
    }
    delete() {
      if (fileFaults.deletePath === this.uri) throw new Error("simulated cleanup failure");
      fileContents.delete(this.uri);
    }
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
import { prepareMobileStorageRecoveryCheck, finishMobileStorageRecoveryCheck } from "../../apps/mobile/src/services/mobileSceneStorageRecoveryCheck";

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
    fileFaults.readPath = "";
    fileFaults.deletePath = "";
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

  it("stores Graph and scene projects together and migrates existing v1 storage", async () => {
    const graph = createMobileGraph("Stored Graph", true, "stored-graph");
    const storedGraph = storeMobileGraph(graph, 5);
    await saveStoredSceneProjects([project, storedGraph]);
    const loaded = await loadStoredSceneProjects();
    expect(loaded.projects).toHaveLength(2);
    expect(readMobileGraph(loaded.projects.find((item) => item.projectType === "graph2d")!)).toEqual(graph);
    expect(decodeMobileSceneStorage(JSON.stringify({ schemaVersion: 1, projects: [project] }))).toMatchObject({ ok: true, migrated: true });
    expect(decodeMobileSceneStorage(payload([{ ...storedGraph, title: "Wrong title" }]))).toMatchObject({ ok: false });
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
  it("does not resurrect a failed first project save from a newly written backup", async () => {
    fileFaults.moveDestination = "documents/math3d-mobile/scene-projects.json";
    await expect(saveStoredSceneProjects([project])).rejects.toMatchObject({ code: "write-failed" });
    expect((await loadStoredSceneProjects()).projects).toEqual([]);
    expect(fileContents.has("documents/math3d-mobile/scene-projects.backup.json")).toBe(false);
  });
  it("keeps a successful first primary save when only backup initialization fails", async () => {
    fileFaults.writePath = "documents/math3d-mobile/scene-projects.backup.tmp";
    await saveStoredSceneProjects([project]);
    expect((await loadStoredSceneProjects()).projects).toEqual([project]);
    expect(fileContents.has("documents/math3d-mobile/scene-projects.tmp")).toBe(false);
  });

  it("reports storage-full and validation failures with actionable messages", () => {
    expect(describeMobileSceneStorageError(new Error("ENOSPC: no space left on device"))).toContain("storage is full");
    expect(describeMobileSceneStorageError(new MobileSceneStorageError("validation", "bad project"))).toContain("failed validation");
  });

  it("loads a healthy primary even when the backup cannot be read", async () => {
    await saveStoredSceneProjects([project]);
    fileFaults.readPath = "documents/math3d-mobile/scene-projects.backup.json";
    expect(await loadStoredSceneProjects()).toMatchObject({ source: "primary", projects: [project], issues: [] });
    await saveStoredSceneProjects([{ ...project, lastOpenedAt: 8 }]);
  });

  it("loads the readable backup without replacing an unreadable primary", async () => {
    await saveStoredSceneProjects([project]);
    const path = "documents/math3d-mobile/scene-projects.json";
    fileFaults.readPath = path;
    const original = fileContents.get(path);
    expect(await loadStoredSceneProjects()).toMatchObject({ source: "backup", projects: [project],
      issues: expect.arrayContaining([expect.stringContaining("Could not read project primary")]) });
    expect(fileContents.get(path)).toBe(original);
    await expect(saveStoredSceneProjects([])).rejects.toMatchObject({ code: "write-failed" });
    expect(fileContents.get(path)).toBe(original);
  });

  it("reports a read failure as invalid storage instead of a first run", async () => {
    fileContents.set("documents/math3d-mobile/scene-projects.json", payload());
    fileFaults.readPath = "documents/math3d-mobile/scene-projects.json";
    expect(await loadStoredSceneProjects()).toMatchObject({ source: "invalid", projects: [],
      issues: [expect.stringContaining("Could not read project primary")] });
  });

  it("preserves both damaged copies and rejects subsequent writes", async () => {
    const path = "documents/math3d-mobile/scene-projects.json";
    const backup = "documents/math3d-mobile/scene-projects.backup.json";
    fileContents.set(path, "{broken-primary"); fileContents.set(backup, "{broken-backup");
    expect(await loadStoredSceneProjects()).toMatchObject({ source: "invalid" });
    await expect(saveStoredSceneProjects([project])).rejects.toMatchObject({ code: "recovery-required" });
    expect(fileContents.get(path)).toBe("{broken-primary"); expect(fileContents.get(backup)).toBe("{broken-backup");
  });

  it("returns recovered projects when storage is full and repairs them on a later launch", async () => {
    await saveStoredSceneProjects([project]);
    fileContents.set("documents/math3d-mobile/scene-projects.json", "{broken");
    fileFaults.writePath = "documents/math3d-mobile/scene-projects.tmp";
    expect(await loadStoredSceneProjects()).toMatchObject({ source: "backup", projects: [project],
      issues: expect.arrayContaining([expect.stringContaining("could not repair the primary file")]) });
    expect(fileContents.get("documents/math3d-mobile/scene-projects.backup.json")).toBeDefined();
    fileFaults.writePath = "";
    expect((await loadStoredSceneProjects()).source).toBe("backup");
    expect(await loadStoredSceneProjects()).toMatchObject({ source: "primary", projects: [project], issues: [] });
  });

  it("never downgrades a newer primary using an older valid backup", async () => {
    const path = "documents/math3d-mobile/scene-projects.json";
    const future = JSON.stringify({ schemaVersion: 99, projects: [project] });
    fileContents.set(path, future); fileContents.set("documents/math3d-mobile/scene-projects.backup.json", payload());
    expect(await loadStoredSceneProjects()).toMatchObject({ source: "invalid" });
    await expect(saveStoredSceneProjects([])).rejects.toMatchObject({ code: "recovery-required" });
    expect(fileContents.get(path)).toBe(future);
  });

  it("serializes recovery with a queued save so the newer accepted library wins", async () => {
    await saveStoredSceneProjects([project]);
    fileContents.set("documents/math3d-mobile/scene-projects.json", "{truncated");
    const recovery = loadStoredSceneProjects();
    const save = saveStoredSceneProjects([{ ...project, lastOpenedAt: 90 }]);
    expect((await recovery).source).toBe("backup"); await save;
    expect((await loadStoredSceneProjects()).projects).toEqual([{ ...project, lastOpenedAt: 90 }]);
  });

  it("keeps the storage-full error even when staging cleanup also fails", async () => {
    await saveStoredSceneProjects([project]);
    fileFaults.writePath = fileFaults.deletePath = "documents/math3d-mobile/scene-projects.tmp";
    await expect(saveStoredSceneProjects([])).rejects.toMatchObject({ code: "storage-full" });
    expect((await loadStoredSceneProjects()).projects).toEqual([project]);
  });

  it("runs the isolated recovery matrix without modifying the user's library", async () => {
    await saveStoredSceneProjects([project]);
    const before = new Map(fileContents);
    const prepared = await prepareMobileStorageRecoveryCheck();
    expect(prepared.phase).toBe("restart-pending");
    expect(prepared.checks).toHaveLength(9);
    expect(prepared.checks.every(check => check.passed)).toBe(true);
    const finished = await finishMobileStorageRecoveryCheck();
    expect(finished.phase).toBe("complete");
    expect(finished.checks).toHaveLength(10);
    expect(finished.checks.filter(check => !check.passed)).toEqual([]);
    expect(finished.libraryUnchanged).toBe(true);
    for (const [path, raw] of before) expect(fileContents.get(path)).toBe(raw);
    await expect(finishMobileStorageRecoveryCheck()).rejects.toThrow("Prepare a new recovery check first");
  });
});
