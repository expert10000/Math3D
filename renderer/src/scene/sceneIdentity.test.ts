import { describe, expect, it } from "vitest";
import {
  buildSceneIdentityIndex,
  createSceneEntityIdentity,
  resolveSceneLocalId,
  revisionsFromSceneIdentities,
  sceneEntityId,
} from "./sceneIdentity";

describe("scene identity", () => {
  it("creates stable module-scoped IDs and normalizes relationship metadata", () => {
    const identity = createSceneEntityIdentity({
      localId: " object-a ",
      revision: 3.8,
      moduleKind: "geometry",
      sourceKind: "derived",
      parentId: "geometry:source-a",
      derivedFromIds: ["geometry:source-a", "geometry:source-a"],
      dependencyIds: ["geometry:source-a", "geometry:operand-b"],
      metadata: { name: "Result A" },
    });

    expect(identity).toEqual({
      id: "geometry:object-a",
      localId: "object-a",
      revision: 3,
      moduleKind: "geometry",
      sourceKind: "derived",
      parentId: "geometry:source-a",
      derivedFromIds: ["geometry:source-a"],
      dependencyIds: ["geometry:source-a", "geometry:operand-b"],
      metadata: { name: "Result A" },
    });
    expect(sceneEntityId("mesh", "object-a")).toBe("mesh:object-a");
  });

  it("resolves local IDs without allowing cross-module aliases", () => {
    const geometry = createSceneEntityIdentity({
      localId: "shared",
      moduleKind: "geometry",
      sourceKind: "procedural",
    });
    const mesh = createSceneEntityIdentity({
      localId: "shared",
      moduleKind: "mesh",
      sourceKind: "dataset",
    });
    const index = buildSceneIdentityIndex([geometry, mesh]);

    expect(resolveSceneLocalId(index, geometry.id, "geometry")).toBe("shared");
    expect(resolveSceneLocalId(index, mesh.id, "geometry")).toBeNull();
  });

  it("restores revision metadata while ignoring another module", () => {
    const identities = [
      createSceneEntityIdentity({ localId: "a", revision: 5, moduleKind: "geometry", sourceKind: "procedural" }),
      createSceneEntityIdentity({ localId: "b", revision: 2, moduleKind: "geometry", sourceKind: "dataset" }),
      createSceneEntityIdentity({ localId: "a", revision: 99, moduleKind: "mesh", sourceKind: "derived" }),
    ];

    expect(revisionsFromSceneIdentities(identities, "geometry")).toEqual({ a: 5, b: 2 });
  });
});
