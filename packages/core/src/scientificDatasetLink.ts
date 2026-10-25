import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { isGraph2DFieldReference, type Graph2DFieldReference,
  type Graph2DFieldLocator } from "./graph2dFieldReference";
import { scientificAxisCoordinate, validateScientificLineCoordinates } from "./scientificDatasetCoordinates";

/** Immutable metadata link to one verified bundle dataset; binary values stay external. */
export type ScientificDatasetLink = Readonly<{
  schema: "math3d.scientific-dataset-link/v1"; sourceHash: string;
  locator: Graph2DFieldLocator; sceneFingerprint: string; sceneId: string;
  datasetId: string; semanticType: Graph2DFieldReference["semanticType"];
  shape: readonly number[]; axes: Graph2DFieldReference["axes"];
  components: readonly Readonly<{ name: string; resourceSha256: string }>[];
}>;

export function createScientificDatasetLink(references: readonly Graph2DFieldReference[]): ScientificDatasetLink {
  if (references.length < 1 || references.length > 3 || !references.every(isGraph2DFieldReference))
    throw new TypeError("A scientific dataset link needs one to three valid component references.");
  const first = references[0]!;
  if (new Set(references.map(reference => reference.component)).size !== references.length ||
      references.some(reference => reference.sceneFingerprint !== first.sceneFingerprint ||
        reference.sceneId !== first.sceneId || reference.datasetId !== first.datasetId ||
        reference.semanticType !== first.semanticType ||
        canonicalJsonStringify(reference.locator) !== canonicalJsonStringify(first.locator) ||
        canonicalJsonStringify(reference.shape) !== canonicalJsonStringify(first.shape) ||
        canonicalJsonStringify(reference.axes) !== canonicalJsonStringify(first.axes)))
    throw new TypeError("Scientific components must share one verified bundle, grid and dataset.");
  const components = references.map(reference => ({ name: reference.component,
    resourceSha256: reference.resourceSha256 }));
  const source = { locator: first.locator, sceneFingerprint: first.sceneFingerprint,
    sceneId: first.sceneId, datasetId: first.datasetId, semanticType: first.semanticType,
    shape: first.shape, axes: first.axes, components };
  return { schema: "math3d.scientific-dataset-link/v1", sourceHash: structuralHash(source), ...source };
}

export type ScientificDerivedView = Readonly<{
  schema: "math3d.scientific-derived-view/v1"; sourceHash: string; viewHash: string;
  selection: Readonly<{ kind: "line"; component: string; varyingAxis: number;
    fixed: readonly Readonly<{ axis: number; index: number; coordinate: number; unit: string }>[] }> |
    Readonly<{ kind: "glyphs"; components: readonly string[]; density: readonly number[]; maxGlyphs: number }>;
}>;

/** Reconstructable view description; existing Project documents remain the persistence source of truth. */
export function createScientificDerivedView(link: ScientificDatasetLink,
  selection: Readonly<{ kind: "line"; component: string; varyingAxis: number;
    fixed: readonly Readonly<{ axis: number; index: number }>[] }> |
    Readonly<{ kind: "glyphs"; components: readonly string[]; density: readonly number[]; maxGlyphs: number }>):
  ScientificDerivedView {
  const source = { locator: link.locator, sceneFingerprint: link.sceneFingerprint,
    sceneId: link.sceneId, datasetId: link.datasetId, semanticType: link.semanticType,
    shape: link.shape, axes: link.axes, components: link.components };
  if (link.schema !== "math3d.scientific-dataset-link/v1" ||
      link.sourceHash !== structuralHash(source) || !link.components.length ||
      !link.components.every(component => /^[a-f0-9]{64}$/.test(component.resourceSha256)) ||
      link.shape.length !== link.axes.length || link.shape.some(size =>
        !Number.isSafeInteger(size) || size < 1 || size > 256))
    throw new TypeError("Invalid verified scientific dataset link.");
  let view: ScientificDerivedView["selection"];
  if (selection.kind === "line") {
    if (!link.components.some(component => component.name === selection.component))
      throw new TypeError("The selected component is absent from the verified dataset.");
    const axes = link.axes.map((axis, index) => ({ ...axis, count: link.shape[index]! }));
    validateScientificLineCoordinates(axes, selection.varyingAxis, selection.fixed);
    view = { kind: "line", component: selection.component, varyingAxis: selection.varyingAxis,
      fixed: selection.fixed.map(item => ({ ...item,
        coordinate: scientificAxisCoordinate(axes[item.axis]!, item.index), unit: axes[item.axis]!.unit })) };
  } else {
    if (selection.components.length !== link.components.length ||
        selection.components.some((name, index) => name !== link.components[index]!.name) ||
        selection.density.length !== link.shape.length ||
        selection.density.some(size => !Number.isSafeInteger(size) || size < 2 || size > 16) ||
        !Number.isSafeInteger(selection.maxGlyphs) || selection.maxGlyphs < 1 ||
        selection.density.reduce((product, size) => product * size, 1) > selection.maxGlyphs)
      throw new TypeError("Invalid component order, density or glyph budget.");
    view = { kind: "glyphs", components: [...selection.components], density: [...selection.density],
      maxGlyphs: selection.maxGlyphs };
  }
  return { schema: "math3d.scientific-derived-view/v1", sourceHash: link.sourceHash,
    viewHash: structuralHash({ sourceHash: link.sourceHash, selection: view }), selection: view };
}
