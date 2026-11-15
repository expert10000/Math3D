import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { defaultVectorField3DWorkspace, fieldExplorerWorkflow, type FieldExplorerDifferenceSettings,
  type Math3DProject, type VectorField3DDocument, type VectorField3DComparisonTransfers } from "@math3d/core";
import { VectorField3DSliceView } from "./VectorField3DSliceView";
import { fieldExplorerBaselineSlices } from "./fieldExplorerBaselineSlices";
import { loadVerifiedVectorFieldTransfer, SCIENTIFIC_FIELD_REVERIFY_EVENT } from "./loadVerifiedVectorFieldTransfer";
import { fieldExplorerDifferenceSlice, fieldExplorerDifferenceProbe } from "./fieldExplorerDifferenceSlice";
import { FieldExplorerDifferenceView } from "./FieldExplorerDifferenceView";

type SliceProps = ComponentProps<typeof VectorField3DSliceView>;
export function FieldExplorerBaselineViews({ document, baseline, project, onProbeSelect, onClose,
  onSendLineToGraphs, onSendDerivedLineToGraphs, onDifferenceChange }: {
  document: VectorField3DDocument; baseline: VectorField3DDocument | null;
  project?: Math3DProject | null;
  onProbeSelect: NonNullable<SliceProps["onProbeSelect"]>; onClose: () => void;
  onSendLineToGraphs?: SliceProps["onSendLineToGraphs"];
  onSendDerivedLineToGraphs?: SliceProps["onSendDerivedLineToGraphs"];
  onDifferenceChange?: (settings: FieldExplorerDifferenceSettings) => void;
}) {
  const view = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const differenceSettings = fieldExplorerWorkflow(document).differenceView ?? { visible: false, channel: "magnitude" };
  const scientific = document.source.field.kind === "scientific-bundle" || baseline?.source.field.kind === "scientific-bundle";
  const pairKey = JSON.stringify([project?.identity, document.identity, baseline?.identity]);
  const [verification, setVerification] = useState<{ key: string; transfers: VectorField3DComparisonTransfers | null; error: string } | null>(null);
  useEffect(() => {
    if (!scientific || !baseline) return;
    let active = true, epoch = 0;
    const verify = async () => {
      const run = ++epoch;
      setVerification(null);
      try {
        const context = project ? { project } : undefined;
        const [a, b] = await Promise.all([loadVerifiedVectorFieldTransfer(document, undefined, context), loadVerifiedVectorFieldTransfer(baseline, undefined, context)]);
        if (active && run === epoch) setVerification({ key: pairKey, transfers: { a, b }, error: "" });
      } catch (cause) {
        if (active && run === epoch) setVerification({ key: pairKey, transfers: null,
          error: `Sources unavailable or changed. Values withheld. ${(cause as Error).message}` });
      }
    };
    void verify();
    window.addEventListener("focus", verify);
    window.addEventListener(SCIENTIFIC_FIELD_REVERIFY_EVENT, verify);
    return () => { active = false; epoch++; window.removeEventListener("focus", verify);
      window.removeEventListener(SCIENTIFIC_FIELD_REVERIFY_EVENT, verify); };
  }, [pairKey, scientific]);
  const currentVerification = verification?.key === pairKey ? verification : null;
  const sampled = useMemo(() => { try {
    if (!baseline) throw new TypeError("Pinned baseline missing or changed. Values are withheld.");
    if (scientific && !currentVerification?.transfers)
      return { slices: null, difference: null, error: currentVerification?.error ?? "" };
    const slices = fieldExplorerBaselineSlices(document, baseline, currentVerification?.transfers ?? {},
      differenceSettings.visible ? differenceSettings.channel : undefined);
    const difference = differenceSettings.visible ?
      fieldExplorerDifferenceSlice(slices.a, slices.b, differenceSettings.channel) : null;
    return { slices, difference, error: "" };
  } catch (cause) { return { slices: null, difference: null, error: (cause as Error).message }; }
  }, [pairKey, view.selectedLayer, view.sliceChannel, document.source.display.colorBy,
    view.sliceCoordinates.join(","), currentVerification, scientific, differenceSettings.visible, differenceSettings.channel]);
  const differenceProbe = sampled.difference && sampled.slices ?
    fieldExplorerDifferenceProbe(sampled.difference, sampled.slices.a, sampled.slices.b, view.probe) : null;
  return <section className="field-explorer-baseline-views" aria-label="Linked A/B field views">
    <header><div><strong>Live A / pinned B</strong><p>Shared physical plane, probe and color range.
      Select a cell in either view to update both profiles. Profiles use native sampled grid points.</p></div>
      <button type="button" onClick={onClose}>Return to single field</button></header>
    <fieldset className="field-explorer-difference-controls" disabled={!onDifferenceChange}>
      <legend>Difference view</legend>
      <label><input type="checkbox" aria-label="Show A−B difference" checked={differenceSettings.visible}
        onChange={event => onDifferenceChange?.({ ...differenceSettings, visible: event.target.checked })} /> Show A−B difference</label>
      <label>Difference channel <select aria-label="Difference channel" value={differenceSettings.channel}
        disabled={!differenceSettings.visible} onChange={event => onDifferenceChange?.({ ...differenceSettings,
          channel: event.target.value as FieldExplorerDifferenceSettings["channel"] })}>
        <option value="magnitude">Vector-difference magnitude ‖A−B‖</option>
        <option value="p">Signed p component · A−B</option>
        <option value="q">Signed q component · A−B</option>
        <option value="r">Signed r component · A−B</option>
      </select></label>
    </fieldset>
    {differenceSettings.visible && <p>A and B show the chosen vector channel with a shared color range.
      Difference uses its own range starting at zero for magnitude, or centered on zero for signed components.</p>}
    {scientific && <div>
      <p role="status">{sampled.slices ? "Both scientific sources verified." :
        sampled.error ? "Scientific views withheld." : "Verifying both scientific sources…"}</p>
      <button type="button" onClick={() => window.dispatchEvent(new Event(SCIENTIFIC_FIELD_REVERIFY_EVENT))}>Reverify A/B sources</button>
    </div>}
    {sampled.error && <p role="alert">{sampled.error}</p>}
    {sampled.slices && baseline && <div className="field-explorer-baseline-grid" data-difference={differenceSettings.visible}>
      {([document, baseline] as const).map((source, i) => <section key={source.identity.id}
        aria-label={i === 0 ? "Live field A" : "Pinned baseline B"}>
        <h4>{i === 0 ? "A · live" : "B · frozen"} · {source.metadata.title}</h4>
        <small>Revision {source.identity.revision} · {source.identity.structuralHash.slice(0, 20)}…</small>
        <VectorField3DSliceView document={source} slice={i === 0 ? sampled.slices!.a : sampled.slices!.b}
          sharedValueRange={sampled.slices!.range} probe={view.probe}
          clipBounds={view.clipBounds} onProbeSelect={onProbeSelect}
          onSendLineToGraphs={i === 0 && source.source.field.kind === "expressions" ? onSendLineToGraphs : undefined}
          onSendDerivedLineToGraphs={i === 0 ? onSendDerivedLineToGraphs : undefined} />
      </section>)}
      {sampled.difference && <FieldExplorerDifferenceView document={document} slice={sampled.difference}
        probe={view.probe} clipBounds={view.clipBounds} onProbeSelect={onProbeSelect} />}
    </div>}
    {sampled.difference && <div className="field-explorer-difference-probe" data-testid="field-difference-probe-readout">
      {differenceProbe ? <table aria-label="A/B difference probe">
        <caption>Linked probe ({view.probe!.map(value => value.toPrecision(6)).join(", ")}) ·
          {" "}coordinate units {document.source.axes.map(axis => axis.unit).join(", ")}. Values in {sampled.difference.unit}.</caption>
        <thead><tr><th scope="col">Quantity</th><th scope="col">A</th><th scope="col">B</th><th scope="col">Δ = A−B</th></tr></thead>
        <tbody>{["p", "q", "r"].map((component, i) => <tr key={component}>
          <th scope="row">{component} ({sampled.difference!.unit})</th>
          {[differenceProbe.a[i]!, differenceProbe.b[i]!, differenceProbe.delta[i]!].map((value, column) =>
            <td key={column} data-probe-quantity={component} data-probe-source={["a", "b", "delta"][column]}>{value.toPrecision(6)}</td>)}
        </tr>)}<tr><th scope="row">Vector norm ({sampled.difference.unit})</th>
          {[differenceProbe.a, differenceProbe.b, differenceProbe.delta].map((vector, i) =>
            <td key={i} data-probe-quantity="norm" data-probe-source={["a", "b", "delta"][i]}>{Math.hypot(...vector).toPrecision(6)}</td>)}
        </tr></tbody>
      </table> : <p>Select a sampled cell in A, B or Difference to inspect the linked probe.</p>}
      <p>The Δ vector norm is ‖A−B‖. Values use the matching native grid; no interpolation or extrapolation is implied.</p>
    </div>}
  </section>;
}
