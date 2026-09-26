import { describe, expect, it } from "vitest";
import {
  createSceneObjectEnvelope,
  planSceneObjectComposition,
  serializeSceneObjectCompositionPlan,
  validateSceneObjectCompositionPlan,
  type CanonicalJsonValue,
  type SceneObjectCompositionInput,
  type SceneObjectCompositionPlan,
  type SceneObjectEnvelope,
} from "@math3d/core";
import collisionFixture from "../../../packages/core/fixtures/scene-object-composition/collision-remap-v1.json";
import danglingFixture from "../../../packages/core/fixtures/scene-object-composition/invalid-dangling-v1.json";

type FixtureObject = { id: string; expression: string; analysisMetadata: Record<string, CanonicalJsonValue> };

const envelope = (object: FixtureObject): SceneObjectEnvelope => createSceneObjectEnvelope({
  producer: { name: "Math3D Desktop", version: "1.5.1", platform: "desktop" },
  object: {
    id: object.id,
    kind: "explicit",
    definition: { id: object.id, kind: "explicit", expression: object.expression, resolution: 48 },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
    style: {},
  },
  geometry: null,
  provenance: {
    sourceFormat: "math3d.scene-project",
    sourceProjectId: collisionFixture.sourceProjectId,
    sourceObjectId: object.id,
    importedAt: null,
  },
  analysisMetadata: object.analysisMetadata,
});

const inputFromFixture = (fixture: typeof collisionFixture): SceneObjectCompositionInput => ({
  sourceFormat: fixture.sourceFormat,
  sourceProjectId: fixture.sourceProjectId,
  objects: fixture.objects.map((object) => envelope(object)),
  dependencies: fixture.dependencies,
});

describe("scene object composition", () => {
  it("matches the golden collision map, rewrites references, and records provenance", () => {
    const result = planSceneObjectComposition(inputFromFixture(collisionFixture), {
      destinationObjectIds: collisionFixture.destinationObjectIds,
      importedAt: collisionFixture.importedAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.idMap).toEqual(collisionFixture.expectedIdMap);
    expect(result.plan.dependencies).toEqual([collisionFixture.expectedDependency]);
    expect(result.plan.objects.map((object) => object.object.id)).toEqual(["alpha-3", "beta"]);
    expect(result.plan.objects[1].analysisMetadata.inputObjectId).toBe("alpha-3");
    expect(result.plan.objects[0].object.definition.id).toBe("alpha-3");
    expect(result.plan.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceProjectId: "source-project",
        sourceObjectId: "alpha",
        destinationObjectId: "alpha-3",
        importedAt: collisionFixture.importedAt,
        producer: { name: "Math3D Desktop", version: "1.5.1", platform: "desktop" },
      }),
    ]));
    expect(validateSceneObjectCompositionPlan(result.plan)).toEqual([]);
  });

  it("is deterministic across source and dependency input order", () => {
    const input = inputFromFixture(collisionFixture);
    const first = planSceneObjectComposition(input, {
      destinationObjectIds: [...collisionFixture.destinationObjectIds].reverse(),
      importedAt: collisionFixture.importedAt,
    });
    const second = planSceneObjectComposition({
      ...input,
      objects: [...input.objects].reverse(),
      dependencies: [...input.dependencies].reverse(),
    }, {
      destinationObjectIds: collisionFixture.destinationObjectIds,
      importedAt: collisionFixture.importedAt,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(serializeSceneObjectCompositionPlan(first.plan)).toBe(serializeSceneObjectCompositionPlan(second.plan));
  });

  it("rejects the golden dangling-dependency case before producing a plan", () => {
    const input: SceneObjectCompositionInput = {
      sourceFormat: danglingFixture.sourceFormat,
      sourceProjectId: danglingFixture.sourceProjectId,
      objects: danglingFixture.objects.map((object) => envelope(object)),
      dependencies: danglingFixture.dependencies,
    };
    expect(planSceneObjectComposition(input, {
      destinationObjectIds: danglingFixture.destinationObjectIds,
      importedAt: danglingFixture.importedAt,
    })).toMatchObject({ ok: false, errors: [expect.stringContaining("dangling dependency")] });
  });

  it("rejects undeclared or mismatched reference paths", () => {
    const input = inputFromFixture(collisionFixture);
    expect(planSceneObjectComposition({
      ...input,
      dependencies: [{ ...input.dependencies[0], referencePath: "/object/id" }],
    }, { destinationObjectIds: [], importedAt: 1 })).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("analysisMetadata")],
    });
    expect(planSceneObjectComposition({
      ...input,
      dependencies: [{ ...input.dependencies[0], toObjectId: "beta" }],
    }, { destinationObjectIds: [], importedAt: 1 })).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("does not contain")],
    });
  });

  it("detects dangling references in a tampered plan", () => {
    const result = planSceneObjectComposition(inputFromFixture(collisionFixture), {
      destinationObjectIds: collisionFixture.destinationObjectIds,
      importedAt: collisionFixture.importedAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tampered = {
      ...result.plan,
      dependencies: [{ ...result.plan.dependencies[0], toObjectId: "missing" }],
    } as SceneObjectCompositionPlan;
    expect(validateSceneObjectCompositionPlan(tampered)).toEqual(expect.arrayContaining([
      expect.stringContaining("dangling reference"),
      expect.stringContaining("not rewritten"),
    ]));
    expect(() => serializeSceneObjectCompositionPlan(tampered)).toThrow(/dangling reference/);
  });
});
