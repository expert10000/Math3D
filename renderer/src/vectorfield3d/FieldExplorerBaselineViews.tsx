import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { defaultVectorField3DWorkspace, type VectorField3DDocument, type VectorField3DComparisonTransfers } from "@math3d/core";
import { VectorField3DSliceView } from "./VectorField3DSliceView";
import { fieldExplorerBaselineSlices } from "./fieldExplorerBaselineSlices";
import { loadVerifiedVectorFieldTransfer, SCIENTIFIC_FIELD_REVERIFY_EVENT } from "./loadVerifiedVectorFieldTransfer";

type SliceProps = ComponentProps<typeof VectorField3DSliceView>;
export function FieldExplorerBaselineViews({ document, baseline, onProbeSelect, onClose,
  onSendLineToGraphs, onSendDerivedLineToGraphs }: {
  document: VectorField3DDocument; baseline: VectorField3DDocument | null;
  onProbeSelect: NonNullable<SliceProps["onProbeSelect"]>; onClose: () => void;
  onSendLineToGraphs?: SliceProps["onSendLineToGraphs"];
  onSendDerivedLineToGraphs?: SliceProps["onSendDerivedLineToGraphs"];
}) {
  const view = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const scientific = document.source.field.kind === "scientific-bundle" || baseline?.source.field.kind === "scientific-bundle";
  const pairKey = JSON.stringify([document.identity, baseline?.identity]);
  const [verification, setVerification] = useState<{ key: string; transfers: VectorField3DComparisonTransfers | null; error: string } | null>(null);
  useEffect(() => {
    if (!scientific || !baseline) return;
    let active = true, epoch = 0;
    const verify = async () => {
      const run = ++epoch;
      setVerification(null);
      try {
        const [a, b] = await Promise.all([loadVerifiedVectorFieldTransfer(document), loadVerifiedVectorFieldTransfer(baseline)]);
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
      return { slices: null, error: currentVerification?.error ?? "" };
    return { slices: fieldExplorerBaselineSlices(document, baseline, currentVerification?.transfers ?? {}), error: "" };
  } catch (cause) { return { slices: null, error: (cause as Error).message }; }
  }, [pairKey, view.selectedLayer, view.sliceChannel, view.sliceCoordinates.join(","), currentVerification, scientific]);
  return <section className="field-explorer-baseline-views" aria-label="Linked A/B field views">
    <header><div><strong>Live A / pinned B</strong><p>Shared physical plane, probe and color range.
      Select a cell in either view to update both profiles. Profiles use native sampled grid points.</p></div>
      <button type="button" onClick={onClose}>Return to single field</button></header>
    {scientific && <div>
      <p role="status">{sampled.slices ? "Both scientific sources verified. External bundle files remain required after Project transfer." :
        sampled.error ? "Scientific views withheld." : "Verifying both scientific sources…"}</p>
      <button type="button" onClick={() => window.dispatchEvent(new Event(SCIENTIFIC_FIELD_REVERIFY_EVENT))}>Reverify A/B sources</button>
    </div>}
    {sampled.error && <p role="alert">{sampled.error}</p>}
    {sampled.slices && baseline && <div className="field-explorer-baseline-grid">
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
    </div>}
  </section>;
}
