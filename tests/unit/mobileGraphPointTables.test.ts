import { describe, expect, it, vi } from "vitest";
const files = vi.hoisted(() => new Map<string, string>());
const picker = vi.hoisted(() => ({ value: null as null | { size: number; text: () => Promise<string> }, error: "" }));
vi.mock("expo-file-system", () => {
  class Directory { uri: string; constructor(...parts: Array<string | { uri: string }>) { this.uri = parts.map((p) => typeof p === "string" ? p : p.uri).join("/"); } create() {} }
  class File {
    uri: string; constructor(...parts: Array<string | { uri: string }>) { this.uri = parts.map((p) => typeof p === "string" ? p : p.uri).join("/"); }
    get exists() { return files.has(this.uri); } get size() { return new TextEncoder().encode(files.get(this.uri) ?? "").length; }
    create() { files.set(this.uri, ""); } write(text: string) { if (!this.exists) throw new Error("File not created"); files.set(this.uri, text); }
    textSync() { return files.get(this.uri) ?? ""; }
    static async pickFileAsync() { if (picker.error) throw new Error(picker.error); return picker.value; }
  }
  return { Directory, File, Paths: { document: "documents" } };
});
import { Graph2DPointTableStore } from "@math3d/core";
import { mobileGraphPointTables, pickMobileGraphPointText } from "../../apps/mobile/src/services/mobileGraphPointTables";

describe("native Graph point sidecar transport", () => {
  it("creates a safe content-addressed file and restores its reference after restart", () => {
    const reference = mobileGraphPointTables.publish([{ id: "row_1", x: 1, y: 2 }]);
    const path = `documents/math3d-graph-tables/${reference.id.slice(14)}.json`;
    expect(files.has(path)).toBe(true);
    const fresh = new Graph2DPointTableStore(mobileGraphPointTables.backing);
    expect(fresh.resolve(reference)).toEqual([{ id: "row_1", x: 1, y: 2 }]);
    files.set(path, "incomplete"); expect(new Graph2DPointTableStore(mobileGraphPointTables.backing).resolve(reference)).toBeNull();
  });
  it("previews bounded picked text and handles cancellation without import", async () => {
    picker.value = { size: 7, text: async () => "x,y\n1,2" }; expect(await pickMobileGraphPointText()).toBe("x,y\n1,2");
    picker.value = { size: 1024 * 1024 + 1, text: async () => "large" }; await expect(pickMobileGraphPointText()).rejects.toThrow(/1 MiB/);
    picker.error = "Picker was cancelled"; expect(await pickMobileGraphPointText()).toBeNull();
    picker.error = ""; picker.value = null; expect(await pickMobileGraphPointText()).toBeNull();
  });
});
