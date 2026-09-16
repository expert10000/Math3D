import { describe, expect, it } from "vitest";
import { executeSceneScript } from "./sceneScriptExecutor";
import { PREPARED_GEOMETRY_SCENE_SCRIPTS } from "./sceneScriptExamples";
import { serializeSceneToScript } from "./sceneScriptSerializer";

describe("prepared Geometry Scene Scripts", () => {
  it.each(PREPARED_GEOMETRY_SCENE_SCRIPTS)("opens and round-trips $title", (preset) => {
    const first = executeSceneScript({ script: preset.script, objects: [] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.objects).toHaveLength(preset.objectCount);
    expect(first.objects.every((object) => object.visible)).toBe(true);
    expect(new Set(first.objects.map((object) => object.id)).size).toBe(preset.objectCount);

    const canonical = serializeSceneToScript(first.objects, { selectedObjectId: first.selectedObjectId });
    const replay = executeSceneScript({ script: canonical, objects: [] });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.objects).toEqual(first.objects);
    expect(replay.selectedObjectId).toBe(first.selectedObjectId);
  });
});
