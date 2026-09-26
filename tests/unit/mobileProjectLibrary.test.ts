import { describe, expect, it } from "vitest";
import { createSceneProjectDocument, serializeSceneProject, type SceneDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import { buildMobileProjectLibraryCards, countMobileProjectLibrarySections } from "../../apps/mobile/src/models/mobileProjectLibrary";

const stored = (id: string, source?: MobileStoredSceneProject["source"], updatedAt = 2): MobileStoredSceneProject => {
  const scene: SceneDocument = {
    id, title: `Project ${id}`, createdAt: 1, updatedAt,
    surfaces: [{ id: `${id}-surface`, kind: "explicit", expression: "x+y" }],
  };
  return {
    id, title: scene.title, updatedAt, lastOpenedAt: updatedAt + 1,
    serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
    ...(source ? { source } : {}),
  };
};

const projects = [
  stored("mine"),
  stored("imported", { kind: "imported", name: "source-file.json", sourceProjectId: "remote", importedAt: 5 }, 10),
  stored("shared", { kind: "shared", name: "friend-file.json", sourceProjectId: "friend", importedAt: 6 }, 8),
  stored("desktop", { kind: "desktop", name: "desktop-file.json", sourceProjectId: "desktop", importedAt: 7 }, 9),
];

describe("mobile project library", () => {
  it("derives every section from one project list without creating duplicate records", () => {
    expect(countMobileProjectLibrarySections(projects)).toEqual({ all: 4, my: 1, imported: 2, shared: 1, files: 3 });
    const options = { query: "", sort: "updated" as const };
    expect(buildMobileProjectLibraryCards(projects, { ...options, section: "all" }).map((card) => card.id)).toEqual(["imported", "desktop", "shared", "mine"]);
    expect(buildMobileProjectLibraryCards(projects, { ...options, section: "my" }).map((card) => card.id)).toEqual(["mine"]);
    expect(buildMobileProjectLibraryCards(projects, { ...options, section: "imported" }).map((card) => card.id)).toEqual(["imported", "desktop"]);
    expect(buildMobileProjectLibraryCards(projects, { ...options, section: "shared" }).map((card) => card.id)).toEqual(["shared"]);
    expect(buildMobileProjectLibraryCards(projects, { ...options, section: "files" }).map((card) => card.id)).toEqual(["imported", "desktop", "shared"]);
  });

  it("searches source filenames and sorts within the selected section", () => {
    const cards = buildMobileProjectLibraryCards(projects, { section: "files", query: "file.json", sort: "title" });
    expect(cards.map((card) => card.id)).toEqual(["desktop", "shared", "imported"].sort());
    expect(cards.every((card) => card.compatible && card.objectCount === 1)).toBe(true);
    expect(cards.find((card) => card.id === "shared")).toMatchObject({ origin: "Shared", sourceName: "friend-file.json" });
  });
});
