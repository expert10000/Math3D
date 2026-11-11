import { useMemo, type ComponentProps } from "react";
import { defaultVectorField3DWorkspace, type VectorField3DDocument } from "@math3d/core";
import { VectorField3DSliceView } from "./VectorField3DSliceView";
import { fieldExplorerBaselineSlices } from "./fieldExplorerBaselineSlices";

type SliceProps = ComponentProps<typeof VectorField3DSliceView>;
export function FieldExplorerBaselineViews({ document, baseline, onProbeSelect, onClose,
  onSendLineToGraphs, onSendDerivedLineToGraphs }: {
  document: VectorField3DDocument; baseline: VectorField3DDocument | null;
  onProbeSelect: NonNullable<SliceProps["onProbeSelect"]>; onClose: () => void;
  onSendLineToGraphs?: SliceProps["onSendLineToGraphs"];
  onSendDerivedLineToGraphs?: SliceProps["onSendDerivedLineToGraphs"];
}) {
  const view = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const sampled = useMemo(() => { try {
    if (!baseline) throw new TypeError("Pinned baseline missing or changed. Values are withheld.");
    return { slices: fieldExplorerBaselineSlices(document, baseline), error: "" };
  } catch (cause) { return { slices: null, error: (cause as Error).message }; }
  }, [document.identity.structuralHash, baseline?.identity.id, baseline?.identity.structuralHash,
    baseline?.identity.revision, view.selectedLayer, view.sliceChannel, view.sliceCoordinates.join(",")]);
  return <section className="field-explorer-baseline-views" aria-label="Linked A/B field views">
    <header><div><strong>Live A / pinned B</strong><p>Shared physical plane, probe and color range.
      Select a cell in either view to update both profiles. Profiles use native sampled grid points.</p></div>
      <button type="button" onClick={onClose}>Return to single field</button></header>
    {sampled.error && <p role="alert">{sampled.error}</p>}
    {sampled.slices && baseline && <div className="field-explorer-baseline-grid">
      {([document, baseline] as const).map((source, i) => <section key={source.identity.id}
        aria-label={i === 0 ? "Live field A" : "Pinned baseline B"}>
        <h4>{i === 0 ? "A · live" : "B · frozen"} · {source.metadata.title}</h4>
        <small>Revision {source.identity.revision} · {source.identity.structuralHash.slice(0, 20)}…</small>
        <VectorField3DSliceView document={source} slice={i === 0 ? sampled.slices!.a : sampled.slices!.b}
          sharedValueRange={sampled.slices!.range} probe={view.probe}
          clipBounds={view.clipBounds} onProbeSelect={onProbeSelect}
          onSendLineToGraphs={i === 0 ? onSendLineToGraphs : undefined}
          onSendDerivedLineToGraphs={i === 0 ? onSendDerivedLineToGraphs : undefined} />
      </section>)}
    </div>}
  </section>;
}
