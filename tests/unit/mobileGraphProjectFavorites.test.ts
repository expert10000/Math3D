import { beforeEach, expect, it, vi } from "vitest";
import { emptyGraph2DProjectFavorites, toggleGraph2DProjectFavorite } from "@math3d/core";
const files = vi.hoisted(() => new Map<string, string>());
const fault = vi.hoisted(() => ({ move: false, write: false }));
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map(p => typeof p === "string" ? p : p.uri).join("/"); }
    create() {}
  }
  class File extends Directory {
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length ?? 0; }
    create() { files.set(this.uri, ""); }
    textSync() { return files.get(this.uri) ?? ""; }
    write(raw: string) { if (fault.write) throw new Error("quota"); files.set(this.uri, raw); }
    delete() { files.delete(this.uri); }
    copy(to: File) { if (to.exists) throw new Error("Target already exists"); files.set(to.uri, this.textSync()); }
    move(to: File) {
      if (fault.move) throw new Error("rename failed");
      if (to.exists) throw new Error("Target already exists");
      files.set(to.uri, this.textSync()); files.delete(this.uri); this.uri = to.uri;
    }
  }
  return { Directory, File, Paths: { document: "documents" } };
});
import { loadMobileGraphProjectFavorites, saveMobileGraphProjectFavorites } from "../../apps/mobile/src/services/mobileGraphProjectFavorites";
const key = "documents/math3d-mobile/graph-project-favorites.json";
const id = "math3d:graph2d:0123456789abcdef0123456789abcdef";
beforeEach(() => { files.clear(); fault.move = fault.write = false; });
it("retains committed preferences after URI-changing moves and repeated updates", () => {
  const selected = toggleGraph2DProjectFavorite(emptyGraph2DProjectFavorites(), id);
  saveMobileGraphProjectFavorites(selected); expect(loadMobileGraphProjectFavorites()).toEqual(selected);
  saveMobileGraphProjectFavorites(emptyGraph2DProjectFavorites()); expect(loadMobileGraphProjectFavorites().ids).toEqual([]);
  expect(files.has(key)).toBe(true); expect(files.has(key.replace(".json", ".tmp"))).toBe(false);
});
it("restores previous preferences on rename failure and retains them on quota failure", () => {
  const selected = toggleGraph2DProjectFavorite(emptyGraph2DProjectFavorites(), id);
  saveMobileGraphProjectFavorites(selected); fault.move = true;
  expect(() => saveMobileGraphProjectFavorites(emptyGraph2DProjectFavorites())).toThrow(/rename/);
  expect(loadMobileGraphProjectFavorites()).toEqual(selected);
  fault.move = false; fault.write = true;
  expect(() => saveMobileGraphProjectFavorites(emptyGraph2DProjectFavorites())).toThrow(/quota/);
  expect(loadMobileGraphProjectFavorites()).toEqual(selected);
});
it("reports corrupt/oversized preferences and allows explicit reset", () => {
  files.set(key, "corrupt"); expect(() => loadMobileGraphProjectFavorites()).toThrow();
  saveMobileGraphProjectFavorites(emptyGraph2DProjectFavorites()); expect(loadMobileGraphProjectFavorites().ids).toEqual([]);
  files.set(key, " ".repeat(32769)); expect(() => loadMobileGraphProjectFavorites()).toThrow(/size/);
});
