import { describe, expect, it } from "vitest";
import { createGeometryObject } from "../proceduralObjects";
import { executeSceneScript } from "./sceneScriptExecutor";
import { serializeSceneToScript } from "./sceneScriptSerializer";

describe("scene script serializer", () => {
  it("round-trips procedural objects through executable script", () => {
    const box = createGeometryObject("box", "base");
    box.name = "Wide base box";
    box.group = "teaching scene";
    box.params.width = 3.2;
    box.params.height = 0.7;
    box.params.depth = 1.4;
    box.transform.position = { x: -1.25, y: 0.35, z: 0.5 };
    box.transform.rotation = { x: 0.1, y: 0.2, z: 0.3 };
    box.transform.scale = { x: 1.5, y: 1, z: 0.75 };
    box.material = { color: 0x3366ff, opacity: 0.72, roughness: 0.42, metalness: 0.18 };

    const sphere = createGeometryObject("sphere", "marker");
    sphere.name = "Green marker";
    sphere.params.radius = 0.45;
    sphere.visible = false;
    sphere.material.color = 0x22c55e;

    const script = serializeSceneToScript([box, sphere], { selectedObjectId: "base" });
    const result = executeSceneScript({ script, objects: [] });

    expect(script).toContain('"name=Wide base box"');
    expect(script).toContain('"group=teaching scene"');
    expect(script).toContain("roughness=0.42");
    expect(script).toContain("metalness=0.18");
    expect(script).toContain("select base");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selectedObjectId).toBe("base");
    expect(result.objects).toEqual([box, sphere]);
  });
});
