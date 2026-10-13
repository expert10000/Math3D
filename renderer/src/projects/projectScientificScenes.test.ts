import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  normalizeMath3DProject, parseMath3DProject, relinkMath3DProjectScientificScene,
  replaceMath3DProjectWorkspace, serializeMath3DProject, upsertMath3DProjectScientificScene,
  type ProjectScientificSceneReference } from "@math3d/core";
import { loadLibraryProject, saveLibraryProject } from "./projectLibrary";

const reference: ProjectScientificSceneReference = {
  format: "scientific-scene/v1", title: "Python sin(x) cos(y)",
  directory: "C:\\scenes\\grid.sscene", sceneFingerprint: "a".repeat(64),
};
const fixture = () => createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("scientific-link")),
  { stableKey: "scientific-link", title: "Scientific project" });
const storage = () => {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); } };
};

describe("lightweight Project scientific-scene links", () => {
  it("seals an external reference without embedding samples and keeps old Projects compatible", () => {
    const original = fixture(), linked = upsertMath3DProjectScientificScene(original, reference);
    expect(linked.workspace).toEqual(original.workspace);
    expect(linked.identity.structuralHash).not.toBe(original.identity.structuralHash);
    expect(upsertMath3DProjectScientificScene(linked, reference)).toEqual(linked);
    const raw = serializeMath3DProject(linked);
    expect(parseMath3DProject(raw)).toEqual(linked);
    expect(raw).not.toContain("values.f64");
    expect(parseMath3DProject(serializeMath3DProject(original))).toEqual(original);
  });

  it("survives a workspace revision and saved-library restart", () => {
    const linked = upsertMath3DProjectScientificScene(fixture(), reference);
    const revised = replaceMath3DProjectWorkspace(linked, linked.workspace);
    const local = storage(); saveLibraryProject(local, revised, 100);
    expect(loadLibraryProject(local, revised.identity.id).scientificScenes).toEqual([reference]);
  });

  it("relinks only the exact fingerprint location and rejects malformed or duplicate references", () => {
    const linked = upsertMath3DProjectScientificScene(fixture(), reference);
    const moved = relinkMath3DProjectScientificScene(linked, reference.sceneFingerprint, "D:\\copy.sscene");
    expect(moved.scientificScenes).toEqual([{ ...reference, directory: "D:\\copy.sscene" }]);
    expect(moved.workspace).toEqual(linked.workspace);
    expect(parseMath3DProject(serializeMath3DProject(moved))).toEqual(moved);
    expect(() => relinkMath3DProjectScientificScene(linked, "b".repeat(64), "D:\\copy.sscene")).toThrow("not linked");
    for (const patch of [{ format: "scientific-scene/v2" }, { directory: "" },
      { sceneFingerprint: "bad" }, { extra: "untrusted" }]) {
      expect(normalizeMath3DProject({ ...linked, scientificScenes: [{ ...reference, ...patch }] }).ok).toBe(false);
    }
    expect(normalizeMath3DProject({ ...linked, scientificScenes: [reference, reference] }).ok).toBe(false);
    expect(normalizeMath3DProject({ ...linked, scientificScenes: [{ ...reference, directory: "D:\\wrong.sscene" }] }).ok).toBe(false);
  });
});
