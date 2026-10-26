import { canonicalJsonStringify, inspectGraph2DFieldReference,
  parseScientificSceneManifest, previewGraph2DScientificVolumeLine,
  scientificFieldResultBinding, structuralHash,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DPointSeriesObject,
  type Graph2DPointTableStore, type Graph2DScientificDatasetPreview,
  type ScientificFieldDocument } from "@math3d/core";
import { reverifyScientificFieldLine, scientificFieldLineSelectionMatchesSlice,
  type ScientificFieldLineSelection } from "./reverifyScientificFieldLine";

type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewGraphSlice" | "previewGraphVolumeLine" |
  "previewGraphComplexVolumeLines" | "closeGraphDataset">;
type Store = Pick<Graph2DPointTableStore, "resolve" | "publish">;
type Entry = Readonly<{ object: Graph2DPointSeriesObject; preview: Graph2DScientificDatasetPreview }>;
export type VerifiedSavedFieldGraphResult = Readonly<{
  graphHash: string; fieldId: string; fieldRevision: number; fieldHash: string;
  sourceHash: string; selectedId: string;
  entries: readonly Entry[]; rowsMatch: boolean; matchesStored: boolean; verifiedHash: string;
}>;

const selectionFrom = (object: Graph2DPointSeriesObject): ScientificFieldLineSelection => {
  const slice = object.origin?.slice;
  if (!slice) throw new TypeError("Saved Graph line has no field selection.");
  return "plane" in slice && slice.plane ?
    { kind: "plane3d", normalAxis: slice.plane.normalAxis,
      planeFixedIndex: slice.plane.fixedIndex, varyingAxis: slice.varyingAxis,
      fixedIndex: slice.fixedIndex } :
    { kind: "grid2d", varyingAxis: slice.varyingAxis as 0 | 1,
      fixedIndex: slice.fixedIndex };
};

const matchingCompanion = (graph: Graph2DDocument, selected: Graph2DPointSeriesObject,
  component: "real" | "imaginary"): Graph2DPointSeriesObject => {
  const origin = selected.origin!, binding = origin.fieldDocument!;
  const matches = graph.source.objects.filter((item): item is Graph2DPointSeriesObject =>
    item.kind === "point-series" && item.id !== selected.id && item.origin?.component === component &&
    !!item.origin.fieldDocument && !!item.origin.slice &&
    canonicalJsonStringify(item.origin.fieldDocument) === canonicalJsonStringify(binding) &&
    canonicalJsonStringify(item.origin.slice) === canonicalJsonStringify(origin.slice));
  if (matches.length !== 1)
    throw new TypeError("Saved complex Graph line needs one matching real/imaginary companion.");
  return matches[0]!;
};

async function reverifyComplexPair(document: ScientificFieldDocument,
  selection: ScientificFieldLineSelection, bridge: Bridge):
  Promise<readonly [Graph2DScientificDatasetPreview, Graph2DScientificDatasetPreview]> {
  const paired = document.source.paired, reference = document.source.reference;
  if (!paired || selection.kind !== "plane3d" || !bridge.previewGraphComplexVolumeLines ||
      !bridge.openGraphDatasetReference || !bridge.closeGraphDataset)
    throw new TypeError("A saved 3D complex pair requires the desktop source verifier.");
  const opened = await bridge.openGraphDatasetReference({ locator: reference.locator,
    sceneFingerprint: reference.sceneFingerprint });
  if (!opened.ok) throw new TypeError(`Saved source ${opened.status}: ${opened.error}`);
  try {
    if (opened.source.fingerprint !== reference.sceneFingerprint ||
        inspectGraph2DFieldReference(reference, opened.source.manifestJson) !== "current" ||
        inspectGraph2DFieldReference(paired.imaginary, opened.source.manifestJson) !== "current")
      throw new TypeError("Saved complex components, axes, shape or checksums changed.");
    const parsed = parseScientificSceneManifest(opened.source.manifestJson);
    if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
    const dataset = parsed.value.datasets.find(item => item.id === reference.datasetId);
    if (!dataset || dataset.quantity.name !== document.source.quantity.name ||
        dataset.quantity.unit !== document.source.quantity.unit)
      throw new TypeError("Saved complex field quantity metadata changed.");
    const lines = await bridge.previewGraphComplexVolumeLines({
      fingerprint: opened.source.fingerprint, datasetId: reference.datasetId,
      normalAxis: selection.normalAxis, planeFixedIndex: selection.planeFixedIndex,
      varyingAxis: selection.varyingAxis, fixedIndex: selection.fixedIndex });
    const previews = lines.map((line, index) => {
      const component = index === 0 ? reference : paired.imaginary;
      const preview = previewGraph2DScientificVolumeLine(opened.source.manifestJson,
        opened.source.fingerprint, line);
      if (preview.origin.component !== component.component ||
          preview.origin.resourceSha256 !== component.resourceSha256 ||
          !scientificFieldLineSelectionMatchesSlice(selection, preview.origin.slice))
        throw new TypeError("Saved complex line component or selection changed.");
      return preview;
    }) as [Graph2DScientificDatasetPreview, Graph2DScientificDatasetPreview];
    if (previews[0].rows.length !== previews[1].rows.length ||
        previews[0].rows.some((row, index) => row.x !== previews[1].rows[index]?.x))
      throw new TypeError("Saved real and imaginary lines are no longer aligned.");
    return previews;
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}

/** Reopen the saved source and verify every transferred sample before comparing Graph rows. */
export async function reverifySavedScientificFieldGraphResult(graph: Graph2DDocument,
  selectedId: string, fields: readonly ScientificFieldDocument[], store: Store,
  bridge: Bridge | undefined = typeof window === "undefined" ? undefined : window.scientificScenes):
  Promise<VerifiedSavedFieldGraphResult> {
  const selected = graph.source.objects.find(item => item.id === selectedId);
  if (selected?.kind !== "point-series" || !selected.origin?.fieldDocument)
    throw new TypeError("Choose a Graph line bound to a saved scientific field.");
  const document = fields.find(item => item.identity.id === selected.origin!.fieldDocument!.id);
  if (!document) throw new TypeError("Saved field document is missing from the Project.");
  const binding = scientificFieldResultBinding(document);
  const selection = selectionFrom(selected);
  if (!bridge) throw new TypeError("Scientific line viewing requires the desktop source verifier.");
  let entries: readonly Entry[];
  if (document.source.paired) {
    if (selected.origin.component !== "real" && selected.origin.component !== "imaginary")
      throw new TypeError("Saved complex Graph line has no component identity.");
    const other = matchingCompanion(graph, selected,
      selected.origin.component === "real" ? "imaginary" : "real");
    const real = selected.origin.component === "real" ? selected : other;
    const imaginary = selected.origin.component === "imaginary" ? selected : other;
    const [realPreview, imaginaryPreview] = await reverifyComplexPair(document, selection, bridge);
    entries = [{ object: real, preview: realPreview }, { object: imaginary, preview: imaginaryPreview }];
  } else {
    const preview = await reverifyScientificFieldLine(document, selection, bridge);
    entries = [{ object: selected, preview }];
  }
  const verified = entries.map(({ object, preview }) => ({ object,
    preview: { ...preview, origin: { ...preview.origin,
      locator: document.source.reference.locator, fieldDocument: binding } } }));
  const rowsMatch = verified.every(({ object, preview }) => {
    const rows = store.resolve(object.table);
    return !!rows && canonicalJsonStringify(rows) === canonicalJsonStringify(preview.rows);
  });
  const matchesStored = rowsMatch && verified.every(({ object, preview }) =>
    canonicalJsonStringify(object.origin) === canonicalJsonStringify(preview.origin));
  return { graphHash: graph.identity.structuralHash, fieldId: binding.id,
    fieldRevision: binding.revision, fieldHash: binding.structuralHash,
    sourceHash: binding.sourceHash, selectedId, entries: verified, rowsMatch, matchesStored,
    verifiedHash: structuralHash(verified.map(({ object, preview }) => ({
      objectId: object.id, origin: preview.origin, rows: preview.rows }))) };
}

/** Build one undoable Graph edit after the UI has repeated and compared verification. */
export function createSavedScientificFieldRefreshAction(verified: VerifiedSavedFieldGraphResult,
  graph: Graph2DDocument, store: Store): Graph2DAuthoringAction {
  if (graph.identity.structuralHash !== verified.graphHash ||
      graph.selection.objectId !== verified.selectedId)
    throw new TypeError("Graph selection or source changed since verification. Reverify the line.");
  const edits = verified.entries.map(({ object, preview }) => {
    const current = graph.source.objects.find(item => item.id === object.id);
    if (current?.kind !== "point-series" ||
        canonicalJsonStringify(current) !== canonicalJsonStringify(object))
      throw new TypeError("Graph line changed since verification. Reverify the line.");
    const style = graph.display.objects.find(item => item.objectId === object.id);
    if (!style) throw new TypeError("Graph line display is missing.");
    return { objectId: object.id, draft: { label: object.label,
      table: store.publish(preview.rows), mode: object.mode, domain: preview.domain,
      origin: preview.origin, style: { color: style.color, lineWidth: style.lineWidth,
        lineStyle: style.lineStyle, visible: style.visible } } };
  });
  return edits.length === 1 ? { type: "edit-point-series", ...edits[0]! } :
    { type: "edit-point-series-pair", edits: edits as [typeof edits[number], typeof edits[number]] };
}
