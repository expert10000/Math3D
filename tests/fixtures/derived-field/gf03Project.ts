import { appendProjectDerivedField, createStableDocumentId,
  migrateProjectScientificSelections, type VectorField3DDocument } from "../../../packages/core/src/index";
import { createGf01LegacyProject } from "../scientific-selection/gf01LegacyProject";

export const gf03VerifyAnalyticSource = (document: VectorField3DDocument) =>
  document.source.field.kind === "expressions";
export const GF03_DERIVED_IDS = {
  magnitude: createStableDocumentId("derived-field", "gf03-magnitude"),
  slice: createStableDocumentId("derived-field", "gf03-slice"),
  profile: createStableDocumentId("derived-field", "gf03-profile"),
} as const;

export const createGf03Project = () => {
  const base = migrateProjectScientificSelections(createGf01LegacyProject());
  const sourceId = base.workspace.entries.find(entry => entry.module === "vector3d")!.expected.id;
  const magnitude = appendProjectDerivedField(base, sourceId,
    { kind: "vector-magnitude" }, { stableKey: "gf03-magnitude", title: "Vector magnitude" },
    gf03VerifyAnalyticSource);
  const slice = appendProjectDerivedField(magnitude, GF03_DERIVED_IDS.magnitude,
    { kind: "plane-slice", normalAxis: 2, coordinate: 3, interpolation: "linear" },
    { stableKey: "gf03-slice", title: "Magnitude at z = 3 m" }, gf03VerifyAnalyticSource);
  return appendProjectDerivedField(slice, GF03_DERIVED_IDS.slice,
    { kind: "line-profile", varyingAxis: 0, fixedCoordinate: 2,
      extent: [-2, 2], samples: 17, interpolation: "linear" },
    { stableKey: "gf03-profile", title: "Magnitude profile" }, gf03VerifyAnalyticSource);
};
