import { beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("expo-file-system", () => {
  class File {
    constructor(readonly uri: string) {}
    get name() { return decodeURIComponent(this.uri).split("/").filter(Boolean).at(-1) ?? ""; }
    get exists() { return files.has(this.name); }
    get size() { return files.get(this.name)?.byteLength ?? 0; }
    async bytes() { return files.get(this.name) ?? new Uint8Array(); }
  }
  class Directory {
    constructor(readonly uri: string) {}
    list() { return [...files.keys()].map(name => new File(`${this.uri}/document/root%2F${name}/`)); }
  }
  return { File, Directory };
});

import { mobileVectorField3DDirectoryReader } from "../../apps/mobile/src/services/mobileVectorField3DBundle";

describe("Android scientific bundle folder reader", () => {
  beforeEach(() => files.clear());
  it("resolves a SAF child URI instead of joining a path to the tree URI", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    files.set("bundle.json", bytes);
    const reader = mobileVectorField3DDirectoryReader("content://provider/tree/root");
    expect(await reader("bundle.json")).toEqual(bytes);
    expect(await reader("manifest.json")).toBeNull();
  });
  it("rejects names that could escape the selected folder", async () => {
    const reader = mobileVectorField3DDirectoryReader("content://provider/tree/root");
    await expect(reader("../bundle.json")).rejects.toThrow(/Invalid scientific bundle path/);
  });
});
