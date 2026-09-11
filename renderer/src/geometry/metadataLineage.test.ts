import { describe, expect, it } from "vitest";
import { createSceneEntityIdentity } from "../scene/sceneIdentity";
import {
  buildGeometryCanonicalMetadata,
  buildGeometryIdentityLineage,
  classifyGeometryLineageRelation,
  classifyGeometryRevisionCause,
  formatGeometryStaleReason,
  geometryCanonicalMetadataToSceneMetadata,
} from "./metadataLineage";

describe("Geometry metadata and lineage", () => {
  it("records canonical parametric metadata without calling sampled values exact", () => {
    const metadata = buildGeometryCanonicalMetadata({
      objectType: "constructed",
      params: {
        constructionKind: "curve-nurbs",
        degree: 3,
        knotVector: [0, 0, 0, 1, 1, 1],
        controlCount: 4,
        closed: false,
        periodic: false,
        orientation: "forward",
      },
      revision: 7,
      representation: "sampled-construction",
      sourceKind: "derived",
      sourceRevision: 5,
      operation: "curve-approximate",
      bounds: { min: [-1, 0, 0], max: [2, 3, 0] },
    });

    expect(metadata).toMatchObject({
      schema: "geometry-object-metadata-v1",
      revision: 7,
      sourceRevision: 5,
      representation: "sampled-construction",
      operation: "curve-approximate",
      primitiveType: "curve-nurbs",
      parameterization: "curve-nurbs",
      degree: 3,
      knots: "0, 0, 0, 1, 1, 1",
      controlCount: 4,
      trimState: "untrimmed",
      closed: false,
      periodic: false,
      orientation: "forward",
      units: "scene-unit",
    });
    expect(metadata.bounds).toContain("min(-1, 0, 0)");
    expect(geometryCanonicalMetadataToSceneMetadata(metadata).metadataSchema).toBe("geometry-object-metadata-v1");
  });

  it("classifies revision propagation causes and formats precise stale reasons", () => {
    expect(classifyGeometryRevisionCause({ operationType: "transform", label: "Move" })).toBe("transform");
    expect(classifyGeometryRevisionCause({ operationType: "topology", label: "Bevel Edge" })).toBe("topology");
    expect(classifyGeometryRevisionCause({ changeSummary: "width segments changed" })).toBe("tessellation");
    expect(classifyGeometryRevisionCause({ label: "Relink source" })).toBe("dependency");
    expect(formatGeometryStaleReason({
      cause: "parameter",
      sourceRevision: 2,
      currentRevision: 5,
      detail: "radius changed",
    })).toBe("parameter change (source revision 2 → 5): radius changed");
  });

  it("builds inspectable parent, construction, and Mesh round-trip lineage edges", () => {
    const source = createSceneEntityIdentity({ localId: "source", moduleKind: "geometry", sourceKind: "procedural" });
    const construction = createSceneEntityIdentity({
      localId: "construction",
      moduleKind: "geometry",
      sourceKind: "derived",
      parentId: source.id,
      derivedFromIds: [source.id],
    });
    const mesh = createSceneEntityIdentity({
      localId: "mesh",
      moduleKind: "geometry",
      sourceKind: "derived",
      derivedFromIds: [construction.id],
      dependencyIds: [construction.id],
      metadata: { representation: "triangle-mesh" },
    });
    const edges = buildGeometryIdentityLineage([source, construction, mesh]);

    expect(edges.some((edge) => edge.sourceId === source.id && edge.targetId === construction.id)).toBe(true);
    expect(edges.find((edge) => edge.targetId === mesh.id && edge.relation === "derived-from")?.kind).toBe("mesh-round-trip");
    expect(classifyGeometryLineageRelation("analyzes")).toBe("analysis");
    expect(classifyGeometryLineageRelation("modified-by")).toBe("operation");
  });
});
