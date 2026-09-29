import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGraph2DPublication, instantiateGraph2DPreset, getGraph2DPresetCatalog, renderGraph2DPublicationArtifact } from "@math3d/core";
const state = vi.hoisted(() => ({ files: new Map<string, Uint8Array>(), cancelled: false, available: true, corrupt: false, share: vi.fn(async (_uri: string, _options: unknown) => {}) }));
vi.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map(part => typeof part === "string" ? part : part.uri).join("/"); }
    get exists() { return state.files.has(this.uri); }
    get name() { return this.uri.split("/").at(-1)!; }
    create() { if (this.exists) throw new Error("File exists"); state.files.set(this.uri, new Uint8Array()); }
    write(value: Uint8Array) { state.files.set(this.uri, value.slice()); }
    async bytes() { const value = state.files.get(this.uri)!.slice(); if (state.corrupt) value[0] ^= 1; return value; }
    delete() { state.files.delete(this.uri); }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map(part => typeof part === "string" ? part : part.uri).join("/"); }
    create() {}
    createFile(name: string) { const file = new MockFile(this, name); file.create(); return file; }
    list() { return [...state.files.keys()].filter(uri => uri.startsWith(this.uri + "/")).map(uri => new MockFile(uri)); }
    static async pickDirectoryAsync() { if (state.cancelled) throw new Error("Picker was cancelled"); return new MockDirectory("documents"); }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: "cache" } };
});
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => state.available, shareAsync: state.share }));
import { saveMobileGraphPublication, shareMobileGraphPublication } from "../../apps/mobile/src/services/mobileGraphPublicationService";
const publication = createGraph2DPublication({ document: instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "service-publication").document, size: { width: 128, height: 128 } });
beforeEach(() => { state.files.clear(); state.share.mockClear(); state.available = true; state.cancelled = false; state.corrupt = false; });
describe("native publication file boundary", () => {
  for (const format of ["svg", "png", "csv", "html"] as const) it(`${format}: saves identical verified bytes and preserves existing files`, async () => {
    const artifact = renderGraph2DPublicationArtifact(publication, format), prior = new Uint8Array([1, 2]);
    state.files.set(`documents/${artifact.fileName}`, prior);
    const saved = await saveMobileGraphPublication(artifact, () => true); expect(saved.status).toBe("saved");
    if (saved.status !== "saved") return;
    expect(saved.fileName).not.toBe(artifact.fileName); expect(state.files.get(`documents/${saved.fileName}`)).toEqual(artifact.bytes);
    expect(state.files.get(`documents/${artifact.fileName}`)).toEqual(prior);
    await shareMobileGraphPublication(artifact, () => true);
    expect(state.share).toHaveBeenCalledWith(expect.stringContaining("cache/math3d-graph-publications/"), expect.objectContaining({ mimeType: artifact.mimeType, UTI: artifact.uti }));
  });
  it("does not write or share cancelled/stale snapshots", async () => {
    const artifact = renderGraph2DPublicationArtifact(publication, "svg");
    state.cancelled = true; expect(await saveMobileGraphPublication(artifact, () => true)).toEqual({ status: "cancelled" });
    state.cancelled = false; expect(await saveMobileGraphPublication(artifact, () => false)).toEqual({ status: "cancelled" });
    await shareMobileGraphPublication(artifact, () => false); expect(state.files.size).toBe(0); expect(state.share).not.toHaveBeenCalled();
  });
  it("fails on corrupt read-back and unavailable sharing", async () => {
    const artifact = renderGraph2DPublicationArtifact(publication, "png"); state.corrupt = true;
    await expect(saveMobileGraphPublication(artifact, () => true)).rejects.toThrow(/verification/);
    await expect(shareMobileGraphPublication(artifact, () => true)).rejects.toThrow(/verification/);
    expect(state.share).not.toHaveBeenCalled(); state.corrupt = false; state.available = false;
    await expect(shareMobileGraphPublication(artifact, () => true)).rejects.toThrow(/unavailable/);
  });
  it("bounds only its private managed cache, retaining user and unrelated cache files", async () => {
    state.files.set("documents/keep.png", new Uint8Array([9])); state.files.set("cache/math3d-graph-publications/unrelated.png", new Uint8Array([8]));
    const artifact = renderGraph2DPublicationArtifact(publication, "svg");
    for (let i = 0; i < 12; i++) await shareMobileGraphPublication(artifact, () => true);
    expect([...state.files.keys()].filter(uri => uri.includes("/graph-")).length).toBe(8);
    expect(state.files.has("documents/keep.png")).toBe(true); expect(state.files.has("cache/math3d-graph-publications/unrelated.png")).toBe(true);
  });
});
