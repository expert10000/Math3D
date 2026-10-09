import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  normalizeMath3DProject, parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  upsertMath3DProjectQuantumScene, type ProjectQuantumSceneReference } from "@math3d/core";
import { loadLibraryProject, saveLibraryProject } from "./projectLibrary";

const reference: ProjectQuantumSceneReference = {
  format: "quantum-scene/v1", title: "Hydrogen 2p", directory: "C:\\scenes\\hydrogen.qscene", sceneFingerprint: "a".repeat(64),
};
const fixture = () => createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("quantum-link")),
  { stableKey: "quantum-link", title: "Quantum project" });
const store = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};

describe("read-only Project quantum-scene links", () => {
  it("seals a versioned external reference without embedding source arrays or changing workspace identity", () => {
    const original = fixture(), linked = upsertMath3DProjectQuantumScene(original, reference);
    expect(linked.workspace).toEqual(original.workspace);
    expect(linked.identity.structuralHash).not.toBe(original.identity.structuralHash);
    expect(linked.quantumScenes).toEqual([reference]);
    expect(upsertMath3DProjectQuantumScene(linked, reference)).toEqual(linked);
    const raw = serializeMath3DProject(linked);
    expect(parseMath3DProject(raw)).toEqual(linked);
    expect(raw).not.toContain("vertices.f64");
  });

  it("retains the reference across workspace revisions and saved-library restart", () => {
    const linked = upsertMath3DProjectQuantumScene(fixture(), reference);
    const revised = replaceMath3DProjectWorkspace(linked, linked.workspace);
    const storage = store(); saveLibraryProject(storage, revised, 100);
    expect(loadLibraryProject(storage, revised.identity.id).quantumScenes).toEqual([reference]);
  });

  it("refuses a changed path, fingerprint, format, unknown field, and duplicate reference even with an old hash", () => {
    const linked = upsertMath3DProjectQuantumScene(fixture(), reference);
    for (const patch of [{ directory: "" }, { sceneFingerprint: "z".repeat(64) },
      { format: "quantum-scene/v2" }, { extra: "untrusted" }]) {
      const tampered = { ...linked, quantumScenes: [{ ...reference, ...patch }] };
      expect(normalizeMath3DProject(tampered).ok).toBe(false);
    }
    expect(normalizeMath3DProject({ ...linked, quantumScenes: [reference, reference] }).ok).toBe(false);
    expect(normalizeMath3DProject({ ...linked, quantumScenes: [{ ...reference, title: "Other" }] }).ok).toBe(false);
    expect(() => parseMath3DProject(JSON.stringify({ ...linked, quantumScenes: [{ ...reference, directory: "C:\\wrong" }] }))).toThrow();
  });

  it("rolls back a rejected save without replacing the valid library payload", () => {
    const linked = upsertMath3DProjectQuantumScene(fixture(), reference), storage = store();
    saveLibraryProject(storage, linked, 100);
    const before = [...storage.values];
    expect(() => saveLibraryProject(storage, { ...linked, quantumScenes: [{ ...reference, sceneFingerprint: "bad" }] } as typeof linked, 200)).toThrow();
    expect([...storage.values]).toEqual(before);
  });
});
