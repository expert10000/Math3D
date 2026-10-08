import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject } from "@math3d/core";
import { VerifiedProjectResources } from "./projectResources";
import { commitProjectResources } from "./projectResourceArchive";

const storage = () => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

describe("resource-free Project activation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("commits immediately and restores saved keys and host on failure", async () => {
    const store = storage(); vi.stubGlobal("localStorage", store);
    const project = createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("plain")), { stableKey: "no-resources" });
    const resources = new VerifiedProjectResources(project);
    expect(resources.byteEntries()).toHaveLength(0);
    store.setItem("math3d.project.v1", "original");
    expect(await commitProjectResources(project, resources, () => {
      store.setItem("math3d.project.v1", "activated");
      return "opened";
    }, undefined, undefined, { reuseExistingProject: true })).toBe("opened");
    expect(store.getItem("math3d.project.v1")).toBe("activated");
    const rollbackHost = vi.fn();
    await expect(commitProjectResources(project, resources, () => {
      store.setItem("math3d.project.v1", "interrupted");
      store.setItem("math3d.project.v1.payload.new", "partial");
      throw new Error("Host restore failed");
    }, rollbackHost, undefined, { reuseExistingProject: true })).rejects.toThrow("Host restore failed");
    expect(store.getItem("math3d.project.v1")).toBe("activated");
    expect(store.getItem("math3d.project.v1.payload.new")).toBeNull();
    expect(rollbackHost).toHaveBeenCalledOnce();
  });

  it("switches the staged backup pointer only after activation and restores it on failure", async () => {
    const store = storage(); vi.stubGlobal("localStorage", store);
    const project = createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("backup-slot")), { stableKey: "backup-slot" });
    const resources = new VerifiedProjectResources(project);
    const key = "math3d.project-resource-backup-slot.v1";
    store.setItem(key, "before-open-a");
    const backup = { project, resources };
    await expect(commitProjectResources(project, resources, () => { throw new Error("Restore failed"); }, undefined, backup,
      { reuseExistingProject: true, stagedBackupSlot: "before-open-b" })).rejects.toThrow("Restore failed");
    expect(store.getItem(key)).toBe("before-open-a");
    await commitProjectResources(project, resources, () => "opened", undefined, backup, { reuseExistingProject: true, stagedBackupSlot: "before-open-b" });
    expect(store.getItem(key)).toBe("before-open-b");
  });
});
