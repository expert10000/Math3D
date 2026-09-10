import { describe, expect, it } from "vitest";
import { createSharedPickContract, sharedPickEntityId } from "./pickContract";

describe("shared pick contract", () => {
  it("creates stable workspace-scoped entity IDs", () => {
    expect(sharedPickEntityId({ workspace: "geometry", objectId: "box 1", kind: "face", localId: 7 })).toBe(
      "pick-v1:geometry:box%201:face:7"
    );
    expect(sharedPickEntityId({ workspace: "mesh", objectId: "box 1", kind: "face", localId: 7 })).not.toBe(
      sharedPickEntityId({ workspace: "geometry", objectId: "box 1", kind: "face", localId: 7 })
    );
  });

  it("normalizes target, revision and spatial fields for adapters", () => {
    expect(
      createSharedPickContract({
        workspace: "geometry",
        kind: "edge",
        objectId: "cylinder-1",
        objectLabel: "Cylinder",
        sceneEntityId: "scene:geometry:cylinder-1",
        sourceRevision: 4,
        localId: "3-8",
        worldPoint: [1, 2, 3],
        normal: [0, 1, 0],
        label: "Cylinder edge [3, 8]",
      })
    ).toMatchObject({
      workspace: "geometry",
      kind: "edge",
      pickEntityId: "pick-v1:geometry:cylinder-1:edge:3-8",
      sceneEntityId: "scene:geometry:cylinder-1",
      sourceRevision: 4,
      worldPoint: [1, 2, 3],
    });
  });
});
