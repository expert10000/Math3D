import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject, createMixedWorkspaceDocument, createQuantumSceneDocument,
  normalizeMath3DProject, parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  relinkMath3DProjectQuantumScene, upsertMath3DProjectQuantumScene, type ProjectQuantumSceneReference } from "@math3d/core";
import { loadLibraryProject, projectPayloadKey, PROJECT_LIBRARY_KEY, PROJECT_STORAGE_KEY, saveLibraryProject } from "./projectLibrary";
import { inspectProjectCompatibility, mergeProjectLiveWorkspace } from "./projectTransfer";

const reference: ProjectQuantumSceneReference = {
  format: "quantum-scene/v1", title: "Hydrogen 2p", directory: "C:\\scenes\\hydrogen.qscene", sceneFingerprint: "a".repeat(64),
};
const fixture = () => createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("quantum-link")),
  { stableKey: "quantum-link", title: "Quantum project" });
const nativeDocument = () => createQuantumSceneDocument({ sceneSchema: "quantum-scene/v1", sceneId: "q-scene", sceneFingerprint: reference.sceneFingerprint,
  provenance: { runId: "run-1", model: "two_level", resultSha256: "b".repeat(64), engine: "QuTiP", engineVersion: "5", adapter: "qvis/1" },
  coordinates: { axes: ["x", "y", "z"], units: ["1", "1", "1"], handedness: "right" },
  datasets: [{ id: "positions", sha256: "c".repeat(64), count: 2, components: 3, unit: "1", bytes: 48 }],
  objects: [{ id: "path", kind: "polyline", label: "Path" }] }, reference.directory, reference.title);
const admitted = () => {
  const linked = upsertMath3DProjectQuantumScene(fixture(), reference), document = nativeDocument();
  const workspace = createMixedWorkspaceDocument({ ...linked.workspace,
    entries: [...linked.workspace.entries, { module: "quantum", checkpoint: document, expected: document.identity, replay: null }],
    activeDocumentIds: [...linked.workspace.activeDocumentIds, document.identity.id] });
  return { document, project: replaceMath3DProjectWorkspace(linked, workspace) };
};
const store = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};

describe("read-only Project quantum-scene links", () => {
  it("admits a native read-only document, persists its descriptor, and never invokes an editor adapter", () => {
    const { document, project } = admitted();
    expect(inspectProjectCompatibility(project)).toMatchObject({ canOpenWorkspace: true,
      documents: expect.arrayContaining([{ id: document.identity.id, module: "quantum", editable: false, readOnly: true,
        revision: 1, replayVerified: true }]) });
    expect(parseMath3DProject(serializeMath3DProject(project))).toEqual(project);
    expect(mergeProjectLiveWorkspace(project.workspace, fixture().workspace).entries.find((entry) => entry.module === "quantum")?.checkpoint).toEqual(document);
  });

  it("relinks the native document without changing its scientific identity and refuses diverging locations", () => {
    const { document, project } = admitted();
    const moved = relinkMath3DProjectQuantumScene(project, reference.sceneFingerprint, "D:\\moved.qscene");
    const movedDocument = moved.workspace.entries.find((entry) => entry.module === "quantum")!.checkpoint;
    expect(movedDocument.identity).toEqual(document.identity);
    expect(movedDocument).toMatchObject({ location: { directory: "D:\\moved.qscene" } });
    expect(normalizeMath3DProject({ ...moved, workspace: project.workspace }).ok).toBe(false);
    expect(mergeProjectLiveWorkspace(moved.workspace, project.workspace).entries.find((entry) => entry.module === "quantum")?.checkpoint).toEqual(movedDocument);
  });
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

  it("relinks only the location of an existing fingerprint and preserves scientific workspace bytes", () => {
    const linked = upsertMath3DProjectQuantumScene(fixture(), reference);
    const moved = relinkMath3DProjectQuantumScene(linked, reference.sceneFingerprint, "D:\\moved\\hydrogen.qscene");
    expect(moved.quantumScenes).toEqual([{ ...reference, directory: "D:\\moved\\hydrogen.qscene" }]);
    expect(moved.workspace).toEqual(linked.workspace);
    expect(moved.identity.revision).toBe(linked.identity.revision + 1);
    expect(relinkMath3DProjectQuantumScene(moved, reference.sceneFingerprint, "D:\\moved\\hydrogen.qscene")).toEqual(moved);
    expect(parseMath3DProject(serializeMath3DProject(moved))).toEqual(moved);
    expect(() => relinkMath3DProjectQuantumScene(linked, "b".repeat(64), "D:\\moved\\hydrogen.qscene")).toThrow("not linked");
    expect(() => relinkMath3DProjectQuantumScene(linked, reference.sceneFingerprint, "")).toThrow("Invalid replacement");
    expect(linked.quantumScenes).toEqual([reference]);
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

  it("rolls back a storage failure after staging an exact-source location update", () => {
    const linked = upsertMath3DProjectQuantumScene(fixture(), reference), storage = store();
    saveLibraryProject(storage, linked, 100);
    const before = [...storage.values];
    const moved = relinkMath3DProjectQuantumScene(linked, reference.sceneFingerprint, "D:\\moved\\hydrogen.qscene");
    const originalIndex = storage.getItem(PROJECT_LIBRARY_KEY);
    const failing = { ...storage, setItem: (key: string, value: string) => {
      if (key === PROJECT_LIBRARY_KEY && value !== originalIndex) throw new Error("Storage full");
      storage.setItem(key, value);
    } };
    expect(() => saveLibraryProject(failing, moved, 200)).toThrow("Storage full");
    expect([...storage.values]).toEqual(before);
    expect(loadLibraryProject(storage, linked.identity.id)).toEqual(linked);
    expect(storage.getItem(projectPayloadKey(linked.identity.id))).toBe(serializeMath3DProject(linked));
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(serializeMath3DProject(linked));
  });
});
