import { useEffect, useState } from "react";
import { compareVectorField3D, createVectorField3DComparisonResult,
  projectVectorField3DComparisonStatus, VECTOR_FIELD3D_COMPARISON_RESULT_TYPE,
  vectorField3DComparisonTransferKey,
  type AnalysisResultEnvelope, type Math3DProject, type VectorField3DDocument,
  type VectorField3DComparisonTransfers } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer } from "./loadVerifiedVectorFieldTransfer";

export function VectorField3DComparisonPanel({ document, project, onSave, onOpenProfile }: {
  document: VectorField3DDocument; project: Math3DProject | null | undefined;
  onSave?: (result: AnalysisResultEnvelope, transfers: VectorField3DComparisonTransfers) => void;
  onOpenProfile?: (result: AnalysisResultEnvelope) => void;
}) {
  const sources = project?.workspace.entries.filter(entry => entry.module === "vector3d" &&
    entry.expected.id !== document.identity.id).map(entry => entry.checkpoint as VectorField3DDocument) ?? [];
  const [secondId, setSecondId] = useState("");
  const [resolution, setResolution] = useState(9);
  const [alignment, setAlignment] = useState<"cartesian-identical" |
    "cartesian-aligned-overlap">("cartesian-identical");
  const [overlapBounds, setOverlapBounds] = useState<[
    [number, number], [number, number], [number, number]]>(() =>
    document.source.axes.map(axis => [axis.min, axis.max]) as
      [[number, number], [number, number], [number, number]]);
  const [result, setResult] = useState<AnalysisResultEnvelope | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [transfers, setTransfers] = useState<VectorField3DComparisonTransfers>({});
  const [verified, setVerified] = useState<Record<string, string>>({});
  const load = loadVerifiedVectorFieldTransfer;
  const key = (source: VectorField3DDocument) =>
    `${source.identity.id}:${source.identity.revision}:${source.identity.structuralHash}`;
  const verifiedTransfer = (source: VectorField3DDocument) => verified[key(source)] ?? null;
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (active) setVerified({});
      const sourcesToCheck = project?.workspace.entries.filter(item => item.module === "vector3d" &&
        item.checkpoint.format === "math3d.vector-field3d-document" &&
        item.checkpoint.source.field.kind === "scientific-bundle").map(item =>
        item.checkpoint as VectorField3DDocument) ?? [];
      const outcomes = await Promise.allSettled(sourcesToCheck.map(async source => {
        const transfer = await load(source);
        return [key(source), vectorField3DComparisonTransferKey(transfer)] as const;
      }));
      if (active) setVerified(Object.fromEntries(outcomes.flatMap(outcome =>
        outcome.status === "fulfilled" ? [outcome.value] : [])));
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [project?.identity.structuralHash]);
  const compare = async () => {
    setResult(null); setError("");
    setBusy(true);
    try {
      const second = sources.find(source => source.identity.id === secondId);
      if (!second) throw new TypeError("Choose a second saved Project field.");
      const bundles = document.source.field.kind === "scientific-bundle" &&
        second.source.field.kind === "scientific-bundle";
      if (alignment === "cartesian-aligned-overlap" && !bundles)
        throw new TypeError("Cross-grid resampling requires two verified scientific bundles.");
      const nextTransfers = bundles ? { a: await load(document), b: await load(second) } : {};
      setTransfers(nextTransfers);
      if (bundles) setVerified(previous => ({ ...previous,
        [key(document)]: vectorField3DComparisonTransferKey(nextTransfers.a!),
        [key(second)]: vectorField3DComparisonTransferKey(nextTransfers.b!) }));
      setResult(createVectorField3DComparisonResult(compareVectorField3D(document, second, {
        frame: alignment, grid: [resolution, resolution, resolution],
        units: "identical", interpolation: bundles ? "verified-volume-trilinear" :
          "analytic-direct", coverage: "complete-or-withhold",
        ...(alignment === "cartesian-aligned-overlap" ? {
          resampling: "physical-overlap-grid" as const,
          domain: overlapBounds } : {}) }, nextTransfers)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const status = result && project ? projectVectorField3DComparisonStatus(project,
    result, verifiedTransfer) : null;
  const saved = project?.workspace.results.filter(item =>
    item.provenance.operation.type === VECTOR_FIELD3D_COMPARISON_RESULT_TYPE &&
    item.provenance.source.documentId === document.identity.id) ?? [];
  return <section aria-label="Field comparison" data-testid="gf18-field-comparison">
    <h5>Field comparison</h5>
    <p>Cartesian axes and identical component units. Choose identical grids or an explicit
      physical overlap; verified-volume trilinear interpolation and complete coverage are
      required for cross-grid comparison. The comparison grid is capped at 4096 samples.</p>
    <label>Second saved field <select value={secondId} onChange={event => {
      const next = sources.find(item => item.identity.id === event.target.value);
      setSecondId(event.target.value); setResult(null);
      if (next) setOverlapBounds(document.source.axes.map((axis, index) => [
        Math.max(axis.min, next.source.axes[index]!.min),
        Math.min(axis.max, next.source.axes[index]!.max)]) as
        [[number, number], [number, number], [number, number]]); }}>
      <option value="">Choose source</option>
      {sources.map(source => <option key={source.identity.id} value={source.identity.id}>
        {source.metadata.title} · revision {source.identity.revision}</option>)}
    </select></label>
    <label>Frame and grid alignment <select data-testid="gf34-alignment" value={alignment}
      onChange={event => { setAlignment(event.target.value as typeof alignment);
        setResult(null); }}>
      <option value="cartesian-identical">Identical Cartesian grid</option>
      <option value="cartesian-aligned-overlap">Physical overlap grid</option>
    </select></label>
    {alignment === "cartesian-aligned-overlap" && <fieldset data-testid="gf34-overlap-bounds">
      <legend>Physical overlap domain (source axis units)</legend>
      {document.source.axes.map((axis, index) => <div key={axis.role}>
        <label>{axis.label} minimum <input type="number" step="any"
          value={overlapBounds[index]![0]} onChange={event => {
            const next = overlapBounds.map(pair => [...pair]) as typeof overlapBounds;
            next[index]![0] = Number(event.target.value); setOverlapBounds(next); setResult(null);
          }} /></label>
        <label>{axis.label} maximum <input type="number" step="any"
          value={overlapBounds[index]![1]} onChange={event => {
            const next = overlapBounds.map(pair => [...pair]) as typeof overlapBounds;
            next[index]![1] = Number(event.target.value); setOverlapBounds(next); setResult(null);
          }} /></label> {axis.unit}
      </div>)}
      <p>Policy: physical-overlap-grid resampling; verified-volume-trilinear;
        identical units; complete-or-withhold coverage.</p>
    </fieldset>}
    <label>Points per axis <select value={resolution} onChange={event => {
      setResolution(Number(event.target.value)); setResult(null); }}>
      {[5, 9, 13, 16].map(n => <option key={n} value={n}>{n}</option>)}
    </select></label>
    <button type="button" disabled={!secondId || busy} onClick={() => void compare()}>
      {busy ? "Verifying sources…" : "Compare fields"}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      <p>Source A {result.provenance.source.documentId} · revision {result.provenance.source.revision}
        {" "}· {result.provenance.source.structuralHash}</p>
      <p>Source B {String((result.provenance.operation.parameters.secondSource as
        { documentId: string }).documentId)} ·
        {" "}{String((result.provenance.operation.parameters.secondSource as
          { revision: number }).revision)} ·
        {" "}{String((result.provenance.operation.parameters.secondSource as
          { structuralHash: string }).structuralHash)}</p>
      <p>Coverage {String(result.summary.valid)}/{String(result.summary.sampled)};
        {" "}angular undefined {String(result.summary.angularUndefined)}.
        {" "}{status?.status === "withheld" ? `Values withheld: ${status.reason}.` :
          `Mean vector difference ${String((result.summary.vectorDifference as { mean: number }).mean)}; ` +
          `mean magnitude difference ${String((result.summary.scalarMagnitudeDifference as { mean: number }).mean)}; ` +
          `mean angular error ${String((result.summary.angularError as { meanRadians: number }).meanRadians)} rad.`}</p>
      <p>Alignment {String(result.provenance.operation.parameters.frame)} ·
        {" "}{String(result.provenance.operation.parameters.resampling ?? "identical-grid")} ·
        {" "}{String(result.provenance.operation.parameters.interpolation)} ·
        {" "}{String(result.provenance.operation.parameters.coverage)}.</p>
      <button type="button" disabled={!onSave || status?.status !== "current"}
        onClick={() => { try { onSave?.(result, transfers); setError(""); }
          catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>
        Save comparison in Project</button>
      <button type="button" disabled={!onOpenProfile || status?.status !== "current" ||
        !saved.some(item => item.resultId === result.resultId)}
        onClick={() => onOpenProfile?.(result)}>Open comparison profile in Graphs</button>
    </div>}
    {saved.length > 0 && <details><summary>Saved comparisons ({saved.length})</summary>
      <ul>{saved.map(item => {
        const savedStatus = projectVectorField3DComparisonStatus(project!, item, verifiedTransfer);
        return <li key={item.resultId}>Source pair {item.provenance.source.documentId} /
          {String((item.provenance.operation.parameters.secondSource as { documentId: string }).documentId)}:
          {" "}{savedStatus.status === "current" ? "current" : `withheld (${savedStatus.reason})`}</li>;
      })}</ul></details>}
  </section>;
}
