import { describe, expect, it } from "vitest";
import { GEOMETRY_OBJECT_REGISTRY, GEOMETRY_OBJECT_TYPES, createGeometryObject } from "../proceduralObjects";
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

  it("keeps scene-to-script-to-scene serialization stable", () => {
    const cylinder = createGeometryObject("cylinder", "axis");
    cylinder.name = "Central axis";
    cylinder.params.radiusTop = 0.25;
    cylinder.params.radiusBottom = 0.35;
    cylinder.params.height = 3;
    cylinder.transform.position = { x: 0.5, y: 1.5, z: -0.25 };
    cylinder.material.color = 0xf97316;

    const torus = createGeometryObject("torus", "ring");
    torus.name = "Orbit ring";
    torus.group = "round trip";
    torus.params.radius = 1.3;
    torus.params.tube = 0.08;
    torus.transform.rotation = { x: Math.PI / 2, y: 0, z: 0 };
    torus.material = { color: 0x14b8a6, opacity: 0.58, roughness: 0.3, metalness: 0.08 };

    const firstScript = serializeSceneToScript([cylinder, torus], { selectedObjectId: "ring" });
    const result = executeSceneScript({ script: firstScript, objects: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const secondScript = serializeSceneToScript(result.objects, { selectedObjectId: result.selectedObjectId });
    expect(secondScript).toBe(firstScript);
    expect(result.selectedObjectId).toBe("ring");
    expect(result.objects.map((object) => object.id)).toEqual(["axis", "ring"]);
    expect(result.objects.map((object) => object.type)).toEqual(["cylinder", "torus"]);
  });

  it("preserves Construct taxonomy and source metadata", () => {
    const loft = createGeometryObject("constructed", "loft-result");
    loft.name = "Section loft";
    loft.params.constructionKind = "surface-loft";
    loft.params.constructionFamily = "surfaces";
    loft.params.authoringSource = "professional-construct";
    loft.params.sourceObjectIds = "section-a,section-b";
    loft.params.height = 3.25;

    const script = serializeSceneToScript([loft], { selectedObjectId: loft.id });
    const result = executeSceneScript({ script, objects: [] });

    expect(script).toContain("add constructed as loft-result");
    expect(script).toContain("constructionKind=surface-loft");
    expect(script).toContain("sourceObjectIds=section-a,section-b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects[0].params).toMatchObject({
      constructionKind: "surface-loft",
      constructionFamily: "surfaces",
      authoringSource: "professional-construct",
      sourceObjectIds: "section-a,section-b",
      height: 3.25,
    });
  });

  it("round-trips a published Scratch construction payload", () => {
    const scratch = createGeometryObject("constructed", "scratch-scene");
    scratch.params.constructionKind = "scratch-scene";
    scratch.params.constructionFamily = "reference";
    scratch.params.authoringSource = "scratch";
    scratch.params.sourceEntityIds = "A,B,AB";
    scratch.params.sourcePayload = JSON.stringify({
      points: [{ id: "A", x: 0, y: 0, z: 0 }],
      segments: [{ a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } }],
    });

    const script = serializeSceneToScript([scratch]);
    const result = executeSceneScript({ script, objects: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects[0].params.sourceEntityIds).toBe("A,B,AB");
    expect(result.objects[0].params.sourcePayload).toBe(scratch.params.sourcePayload);
  });

  it("canonically round-trips every registered Geometry object type with presentation state", () => {
    const objects = GEOMETRY_OBJECT_TYPES.map((type, index) => {
      const object = createGeometryObject(type, `acceptance_${type}`);
      object.name = `${GEOMETRY_OBJECT_REGISTRY[type].label} acceptance ${index + 1}`;
      object.group = index % 2 === 0 ? "primary acceptance" : "secondary acceptance";
      object.transform.position = { x: index * 0.25, y: -index * 0.125, z: index * 0.5 };
      object.transform.rotation = { x: index * 0.05, y: index * 0.1, z: -index * 0.025 };
      object.transform.scale = { x: 1 + index * 0.05, y: 1 + index * 0.025, z: 1 + index * 0.075 };
      object.visible = index % 3 !== 1;
      object.material = {
        color: 0x102030 + index * 0x010101,
        opacity: 0.5 + index * 0.05,
        roughness: 0.2 + index * 0.05,
        metalness: index * 0.05,
      };
      return object;
    });
    const selectedObjectId = objects.at(-1)?.id ?? null;

    const firstScript = serializeSceneToScript(objects, { selectedObjectId });
    const firstResult = executeSceneScript({ script: firstScript, objects: [] });

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    expect(firstResult.objects.map((object) => object.type)).toEqual(GEOMETRY_OBJECT_TYPES);
    expect(firstResult.objects.map((object) => object.id)).toEqual(objects.map((object) => object.id));
    expect(firstResult.objects.map((object) => object.name)).toEqual(objects.map((object) => object.name));
    expect(firstResult.objects.map((object) => object.group)).toEqual(objects.map((object) => object.group));
    expect(firstResult.objects.map((object) => object.visible)).toEqual(objects.map((object) => object.visible));
    expect(firstResult.selectedObjectId).toBe(selectedObjectId);

    const secondScript = serializeSceneToScript(firstResult.objects, {
      selectedObjectId: firstResult.selectedObjectId,
    });
    expect(secondScript).toBe(firstScript);
  });
});
