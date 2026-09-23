import { describe, expect, it } from "vitest";
import {
  createSceneProjectDocument,
  serializeSceneProject,
  type SceneDocument,
} from "@math3d/core";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import {
  createMobileThumbnailCacheKey,
  generateMobileSceneThumbnail,
  isMobileSceneThumbnail,
} from "../../apps/mobile/src/viewer/mobileSceneThumbnail";

const explicitScene: SceneDocument = {
  id: "thumb-explicit",
  title: "Saddle",
  createdAt: 1,
  updatedAt: 2,
  surfaces: [{
    id: "surface-saddle",
    kind: "explicit",
    expression: "x*x-y*y",
    resolution: 18,
    domain: { xSpan: 2, ySpan: 2 },
  }],
};

const asProject = (scene: SceneDocument): MobileStoredSceneProject => ({
  id: scene.id,
  title: scene.title,
  updatedAt: scene.updatedAt,
  lastOpenedAt: scene.updatedAt,
  serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
});

describe("mobile scene thumbnails", () => {
  it("projects actual surface geometry into normalized vector segments", () => {
    const thumbnail = generateMobileSceneThumbnail(explicitScene);
    expect(thumbnail.kind).toBe("ready");
    expect(thumbnail.segments.length).toBeGreaterThan(10);
    expect(isMobileSceneThumbnail(thumbnail)).toBe(true);
    for (const segment of thumbnail.segments) {
      expect([segment.x1, segment.y1, segment.x2, segment.y2].every((value) => value >= 0 && value <= 1)).toBe(true);
    }
  });

  it("uses a neutral state for an implicit scene without a computed mesh", () => {
    const thumbnail = generateMobileSceneThumbnail({
      ...explicitScene,
      id: "thumb-implicit",
      surfaces: [{
        id: "surface-implicit",
        kind: "implicit",
        expression: "x*x+y*y+z*z-1",
        resolution: 24,
        domain: { xSpan: 2, ySpan: 2, zSpan: 2 },
      }],
    });
    expect(thumbnail).toMatchObject({ kind: "uncomputed", segments: [] });
  });

  it("invalidates the cache key when serialized scene content changes", () => {
    const first = asProject(explicitScene);
    const second = asProject({ ...explicitScene, title: "Renamed", updatedAt: 3 });
    expect(createMobileThumbnailCacheKey(first)).not.toBe(createMobileThumbnailCacheKey(second));
  });
});
