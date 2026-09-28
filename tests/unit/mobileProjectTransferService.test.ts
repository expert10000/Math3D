import { describe, expect, it, vi } from "vitest";
import { createSceneProjectDocument, deserializeProjectHandoff, serializeSceneProject } from "@math3d/core";

const state = vi.hoisted(() => ({
  picked: null as null | { uri: string; size: number; text: () => Promise<string> },
  files: new Map<string, string>(),
  share: vi.fn(async (_uri: string, _options: unknown) => {}),
}));

vi.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map((part) => typeof part === "string" ? part : part.uri).join("/"); }
    get exists() { return state.files.has(this.uri); }
    get size() { return state.files.get(this.uri)?.length ?? 0; }
    create() { state.files.set(this.uri, ""); }
    write(value: string) { state.files.set(this.uri, value); }
    async text() { return state.files.get(this.uri) ?? ""; }
    delete() { state.files.delete(this.uri); }
    static async pickFileAsync() { return state.picked; }
  },
  Directory: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map((part) => typeof part === "string" ? part : part.uri).join("/"); }
    create() {}
    createFile(name: string) {
      const uri = `${this.uri}/${name}`;
      state.files.set(uri, "");
      return { uri, write: (value: string) => state.files.set(uri, value), text: async () => state.files.get(uri) ?? "" };
    }
    static async pickDirectoryAsync() { return new this("documents"); }
  },
}));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: state.share }));

import { exportMobileSceneProject, pickMobileSceneProject, shareMobileSceneProject } from "../../apps/mobile/src/services/mobileProjectTransferService";
import { createMobileGraph, storeMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { parseGraph2DDocument } from "@math3d/core";

const scene = createSceneProjectDocument({
  id: "native-transfer", title: "Native transfer", createdAt: 1, updatedAt: 2,
  surfaces: [{ id: "surface", kind: "explicit", expression: "x+y" }],
});
const project = {
  id: scene.scene.id, title: scene.scene.title, updatedAt: 2, lastOpenedAt: 3,
  serializedProject: serializeSceneProject(scene),
};

describe("native project document/share boundary", () => {
  it("exports and shares a validated portable Graph source, never sampled geometry", async () => {
    state.files.clear(); state.share.mockClear();
    const graph = createMobileGraph("Portable Graph", true, "portable");
    const exported = await exportMobileSceneProject(storeMobileGraph(graph));
    expect(exported.status).toBe("exported"); if (exported.status !== "exported") return;
    expect(exported.fileName).toContain(".math3d.graph2d.json");
    expect(parseGraph2DDocument(state.files.get(`documents/${exported.fileName}`)!)).toEqual(graph);
    await shareMobileSceneProject(storeMobileGraph(graph));
    expect(state.share).toHaveBeenCalledOnce();
  });
  it("treats picker cancellation as a no-op", async () => {
    state.picked = null;
    expect(await pickMobileSceneProject()).toEqual({ status: "cancelled" });
  });

  it("reads a selected document, writes and verifies a handoff, then invokes native share", async () => {
    state.files.clear();
    state.share.mockClear();
    state.picked = { uri: "content://provider/native-transfer.json", size: project.serializedProject.length, text: async () => project.serializedProject };
    expect(await pickMobileSceneProject()).toMatchObject({ status: "selected", sourceName: "native-transfer.json", serializedProject: project.serializedProject });
    const exported = await exportMobileSceneProject(project);
    expect(exported).toMatchObject({ status: "exported", fileName: expect.stringContaining(".math3d.handoff.json") });
    if (exported.status !== "exported") return;
    expect(deserializeProjectHandoff(state.files.get(`documents/${exported.fileName}`) ?? "").ok).toBe(true);
    await shareMobileSceneProject(project);
    expect(state.share).toHaveBeenCalledOnce();
    expect(state.share.mock.calls[0]?.[0]).toContain("cache/math3d-mobile-exports/");
  });
});
