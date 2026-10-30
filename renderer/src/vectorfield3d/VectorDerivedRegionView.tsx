import { useEffect, useState } from "react";
import { canonicalJsonStringify, VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
  type AnalysisResultEnvelope, type VectorField3DDocument,
  type VectorField3DOverlayRegion, type VectorField3DSliceArtifact } from "@math3d/core";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile } from
  "./derivedCombinedRegionProfile";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import { vectorDerivedRegionSeries } from "./linkedVectorDerivedRegionGraphs";
import { summarizeVectorDerivedSubrectangle } from "./vectorDerivedSubrectangle";

type Profiles = Readonly<{
  speed: Awaited<ReturnType<typeof verifiedVectorRegionProfile>>;
  derived: Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>>;
}>;
type Check = Readonly<{ document: VectorField3DDocument;
  region: VectorField3DOverlayRegion; state: "checking" | "current" | "withheld";
  profiles?: Profiles; error?: string }>;

export function VectorDerivedRegionView({ document, slice, region, onChange,
  onStartSelection, selecting, busy, onPublish, onPublishSubrectangle,
  onSendToGraphs, savedResults = [], resultStatuses = {},
  savedStatus, linkedRegionFocus, graphSelectionMode = null,
  graphSelectionFirstX = null, graphSelectionBusy = false,
  graphSelectionAxis = 0, graphSelectionError = "", onGraphSelectionMode,
  subrectangleSelecting = false, subrectangleFirst = null,
  subrectangleProposal = null, subrectangleBusy = false,
  subrectangleError = "", onSubrectangleToggle,
  onSubrectangleConfirm }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  region: VectorField3DOverlayRegion | null;
  onChange: (region: VectorField3DOverlayRegion | null) => void;
  onStartSelection: () => void; selecting: boolean; busy: boolean;
  onPublish?: (region: VectorField3DOverlayRegion) => Promise<void>;
  onPublishSubrectangle?: (region: VectorField3DOverlayRegion,
    focus: LinkedRegionGraphFocus) => Promise<void>;
  onSendToGraphs?: (region: VectorField3DOverlayRegion,
    profileAxis?: 0 | 1) => Promise<void>;
  savedResults?: readonly AnalysisResultEnvelope[];
  resultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  savedStatus?: SavedRegionSourceStatus;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
  graphSelectionMode?: "point" | "interval" | null;
  graphSelectionFirstX?: number | null;
  graphSelectionAxis?: 0 | 1;
  graphSelectionBusy?: boolean;
  graphSelectionError?: string;
  onGraphSelectionMode?: (mode: "point" | "interval" | null,
    axis?: 0 | 1) => void;
  subrectangleSelecting?: boolean;
  subrectangleFirst?: readonly [number, number, number] | null;
  subrectangleProposal?: VectorField3DOverlayRegion["bounds"] | null;
  subrectangleBusy?: boolean;
  subrectangleError?: string;
  onSubrectangleToggle?: () => void;
  onSubrectangleConfirm?: () => void;
}) {
  const [check, setCheck] = useState<Check | null>(null);
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState("");
  const [subrectanglePublishing, setSubrectanglePublishing] = useState(false);
  const selected = !!region && region.visible && region.normalAxis === slice.normalAxis &&
    Math.abs(region.fixedCoordinate - slice.fixedCoordinate) < 1e-9;
  useEffect(() => {
    if (!selected || !region) return;
    let active = true;
    const start = setTimeout(() => {
      if (!active) return;
      setCheck({ document, region, state: "checking" });
      void (async () => {
        const speed = await verifiedVectorRegionProfile(document, region);
        const derived = await verifiedCombinedDerivedRegionProfiles(document, region);
        return { speed, derived };
      })().then(profiles => {
        if (active) setCheck({ document, region, state: "current", profiles });
      }).catch(cause => {
        if (active) setCheck({ document, region, state: "withheld",
          error: cause instanceof Error ? cause.message : String(cause) });
      });
    }, 0);
    return () => { active = false; clearTimeout(start); };
  }, [document, region, selected, revision]);
  const current = check?.document === document && check.region === region ? check : null;
  const focused = selected && linkedRegionFocus?.combined?.length === 3 ?
    linkedRegionFocus : null;
  const freshFocus = focused && current?.state === "current" && current.profiles ?
    [current.profiles.speed, current.profiles.derived.divergence,
      current.profiles.derived.curlMagnitude] : null;
  const checkedProfiles = (savedProfiles: NonNullable<LinkedRegionGraphFocus["combined"]> |
    undefined, profileAxis: 0 | 1, columns: readonly [number, number]) =>
    !!freshFocus && !!savedProfiles &&
    vectorDerivedRegionSeries.every((series, index) => {
      const saved = savedProfiles[index];
      const fresh = freshFocus[index];
      if (!saved || !fresh || saved.series !== series || saved.unit !== fresh.unit)
        return false;
      const rows = (profileAxis === 1 ? fresh.rowProfiles : fresh.rows)
        .slice(columns[0], columns[1] + 1);
      return canonicalJsonStringify(saved.values) ===
        canonicalJsonStringify(rows.map(row => row.y)) &&
        saved.gaps === rows.filter(row => row.y === null).length;
    });
  const intersection = focused?.intersection;
  const intersectionCurrent = !!intersection &&
    checkedProfiles(intersection.columnProfiles, 0, intersection.columns) &&
    checkedProfiles(intersection.rowProfiles, 1, intersection.rows);
  const focusRowsCurrent = !!focused &&
    checkedProfiles(focused.combined, focused.profileAxis, focused.columns) &&
    (!intersection || intersectionCurrent);
  const subrectangle = intersectionCurrent && intersection && current?.profiles && region ?
    summarizeVectorDerivedSubrectangle(region, intersection.bounds,
      current.profiles.speed, current.profiles.derived) : null;
  const savedSubrectangle = intersection && region ? [...savedResults].reverse().find(result =>
    result.provenance.operation.type ===
      VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE &&
    canonicalJsonStringify(result.provenance.operation.parameters.region) ===
      canonicalJsonStringify(region) &&
    canonicalJsonStringify(result.provenance.operation.parameters.bounds) ===
      canonicalJsonStringify(intersection.bounds) &&
    (result.provenance.operation.parameters.profiles as
      { columnPairId?: string; rowPairId?: string } | undefined)?.columnPairId ===
      intersection.columnPairId &&
    (result.provenance.operation.parameters.profiles as
      { rowPairId?: string } | undefined)?.rowPairId === intersection.rowPairId) : null;
  const savedSubrectangleStatus = savedSubrectangle ?
    resultStatuses[savedSubrectangle.resultId] : undefined;
  const savedSubrectangleCurrent = typeof savedSubrectangleStatus === "object" &&
    savedSubrectangleStatus.kind === "vector-derived" &&
    [savedSubrectangleStatus.vector, savedSubrectangleStatus.divergence,
      savedSubrectangleStatus.curlMagnitude].every(status => status === "source-current");
  const stats = (value: { count: number; gaps: number; mean: number | null;
    min: number | null; max: number | null }, unit: string) =>
    `${value.count}/289 samples (${value.gaps} gaps); ${value.mean === null ?
      `no finite values ${unit}` : `mean ${value.mean.toPrecision(5)}, min ${
        value.min!.toPrecision(5)}, max ${value.max!.toPrecision(5)} ${unit}`}`;
  const run = (action: (region: VectorField3DOverlayRegion,
    profileAxis?: 0 | 1) => Promise<void>, profileAxis: 0 | 1 = 0) => {
    if (!region) return;
    setActionError("");
    void action(region, profileAxis).catch(cause => setActionError(cause instanceof Error ?
      cause.message : String(cause)));
  };
  const axes = slice.planeAxes.map(axis => document.source.axes[axis]!);
  const proposedCells = subrectangleProposal && region ? (() => {
    const indices = ([0, 1] as const).map(axis => Array.from({ length: 17 }, (_, index) =>
      region.bounds[axis][0] + (region.bounds[axis][1] - region.bounds[axis][0]) *
        index / 16).flatMap((value, index) =>
      value >= subrectangleProposal[axis][0] - 1e-12 &&
      value <= subrectangleProposal[axis][1] + 1e-12 ? [index] : []));
    return { columns: indices[0]!, rows: indices[1]!,
      count: indices[0]!.length * indices[1]!.length };
  })() : null;
  return <section aria-label="Vector-derived physical region"
    data-testid="vector-derived-region">
    <h4>Vector speed, divergence and curl magnitude region</h4>
    <button type="button" aria-pressed={selecting} onClick={onStartSelection}>
      {selecting ? "Click two corners on the slice" : "Select vector rectangle"}</button>
    {selected && region && <>
      <button type="button" onClick={() => onChange(null)}>Remove region</button>
      {focused && <div data-testid="scientific-vector-region-graph-focus"
        role={focusRowsCurrent ? "status" : "alert"}>
        <p>Graphs selection: {focused.profileAxis === 1 ? "rows" : "columns"} {focused.columns[0] + 1}–{
          focused.columns[1] + 1}, {focused.xBounds[0].toPrecision(6)} to {
          focused.xBounds[1].toPrecision(6)} {focused.xUnit}.</p>
        {focusRowsCurrent ? <ul>{focused.combined?.map(item => <li key={item.series}
          data-series={item.series}>{item.series}: {item.values.length - item.gaps}/{
            item.values.length} {focused.profileAxis === 1 ? "rows" : "columns"} available ({item.gaps} gaps), {item.unit}{
            item.values.length === 1 ? `; ${item.values[0] === null ? "gap" :
              `value ${item.values[0]} ${item.unit}`}` : ""}.</li>)}</ul> :
          <p>Selected values withheld until all three source profiles reverify and
            match the saved Graphs rows.</p>}
      </div>}
      {intersection && (subrectangle ? <div role="status"
        data-testid="scientific-vector-intersection-summary">
        <h5>Verified vector subrectangle</h5>
        <p>Columns {intersection.columns[0] + 1}–{intersection.columns[1] + 1},
          rows {intersection.rows[0] + 1}–{intersection.rows[1] + 1};
          {" "}{subrectangle.sampleCount} lattice positions.</p>
        <ul>{(["vector", "divergence", "curlMagnitude"] as const).map(key => {
          const field = subrectangle[key];
          const unit = key === "vector" ? subrectangle.vectorUnit : key ===
            "divergence" ? subrectangle.divergenceUnit : subrectangle.curlMagnitudeUnit;
          return <li key={key} data-series={key === "curlMagnitude" ?
            "curl-magnitude" : key}>{key === "curlMagnitude" ? "curl-magnitude" : key}:
            {" "}{field.count}/{subrectangle.sampleCount} available ({field.gaps} gaps),
            {" "}{unit}; {field.mean === null ? "no finite value" :
              `mean ${field.mean.toPrecision(6)}, range ${field.min!.toPrecision(6)}–${
                field.max!.toPrecision(6)} ${unit}`}.</li>;
        })}</ul>
        {onPublishSubrectangle && focused && <button type="button"
          data-testid="scientific-publish-vector-subrectangle"
          disabled={busy || subrectanglePublishing} onClick={() => {
            setActionError(""); setSubrectanglePublishing(true);
            void onPublishSubrectangle(region, focused).catch(cause =>
              setActionError(cause instanceof Error ? cause.message : String(cause)))
              .finally(() => setSubrectanglePublishing(false));
          }}>{subrectanglePublishing ? "Verifying subrectangle…" :
            "Publish subrectangle to Project"}</button>}
        {savedSubrectangle && <p data-testid="scientific-vector-subrectangle-saved-status"
          role={savedSubrectangleCurrent ? "status" : "alert"}>Saved Project subrectangle: {
            savedSubrectangleCurrent ? "statistics reverified" :
              "values withheld until source, profiles and statistics reverify"}.</p>}
      </div> : <p role="alert" data-testid="scientific-vector-intersection-withheld">
        Subrectangle values withheld until all six saved profiles and the bounded
        vector source reverify.</p>)}
      <p>Physical rectangle: {axes[0]!.label} {region.bounds[0][0]} to {
        region.bounds[0][1]} {axes[0]!.unit}; {axes[1]!.label} {
        region.bounds[1][0]} to {region.bounds[1][1]} {axes[1]!.unit}; {
        document.source.axes[region.normalAxis]!.label} = {
        region.fixedCoordinate} {document.source.axes[region.normalAxis]!.unit}.</p>
      {onGraphSelectionMode && <div data-testid="scientific-vector-region-to-graphs">
        <p>Choose a physical column, row or strip inside this rectangle to focus the
          saved vector speed, divergence and curl magnitude profiles in Graphs.</p>
        <button type="button" aria-pressed={graphSelectionMode === "point" &&
          graphSelectionAxis === 0}
          disabled={graphSelectionBusy || current?.state !== "current"}
          onClick={() => onGraphSelectionMode("point", 0)}>Select Graphs vector column</button>
        <button type="button" aria-pressed={graphSelectionMode === "interval" &&
          graphSelectionAxis === 0}
          disabled={graphSelectionBusy || current?.state !== "current"}
          onClick={() => onGraphSelectionMode("interval", 0)}>Select Graphs vector strip</button>
        <button type="button" aria-pressed={graphSelectionMode === "point" &&
          graphSelectionAxis === 1} disabled={graphSelectionBusy || current?.state !== "current"}
          onClick={() => onGraphSelectionMode("point", 1)}>Select Graphs vector row</button>
        <button type="button" aria-pressed={graphSelectionMode === "interval" &&
          graphSelectionAxis === 1} disabled={graphSelectionBusy || current?.state !== "current"}
          onClick={() => onGraphSelectionMode("interval", 1)}>Select Graphs vector row strip</button>
        {onSubrectangleToggle && <button type="button"
          data-testid="scientific-select-vector-subrectangle"
          aria-pressed={subrectangleSelecting}
          disabled={subrectangleBusy || current?.state !== "current"}
          onClick={onSubrectangleToggle}>Select Graphs vector subrectangle on slice</button>}
        {subrectangleSelecting && <div role="status"
          data-testid="scientific-vector-subrectangle-preview">
          {subrectangleProposal ? <>
            <p>Proposed physical bounds: {axes[0]!.label} {
              subrectangleProposal[0][0].toPrecision(6)} to {
              subrectangleProposal[0][1].toPrecision(6)} {axes[0]!.unit}; {
              axes[1]!.label} {subrectangleProposal[1][0].toPrecision(6)} to {
              subrectangleProposal[1][1].toPrecision(6)} {axes[1]!.unit}.</p>
            <p data-testid="scientific-vector-subrectangle-cells">{proposedCells?.count ?
              `Selected profile cells: columns ${proposedCells.columns[0]! + 1}–${
                proposedCells.columns.at(-1)! + 1}, rows ${proposedCells.rows[0]! + 1}–${
                proposedCells.rows.at(-1)! + 1}; ${proposedCells.count} cells.` :
              "No saved profile cells in these bounds; choose a wider area."}</p>
            <button type="button" data-testid="scientific-confirm-vector-subrectangle"
              disabled={subrectangleBusy || !proposedCells?.count ||
                current?.state !== "current"}
              onClick={onSubrectangleConfirm}>{subrectangleBusy ?
                "Verifying six profiles…" : "Focus six verified Graphs profiles"}</button>
          </> : <p>{subrectangleFirst ?
            "Click the opposite corner inside the saved rectangle." :
            "Click the first corner inside the saved rectangle."}</p>}
          <button type="button" disabled={subrectangleBusy}
            onClick={onSubrectangleToggle}>Cancel subrectangle</button>
        </div>}
        {subrectangleError && <p role="alert"
          data-testid="scientific-vector-subrectangle-error">{subrectangleError}</p>}
        {graphSelectionMode && <button type="button"
          onClick={() => onGraphSelectionMode(null)}>Cancel Graphs selection</button>}
        {graphSelectionMode && <p role="status">{graphSelectionBusy ?
          "Verifying all three saved source profiles…" :
          graphSelectionMode === "point" ?
            "Click once inside the rectangle." : graphSelectionFirstX === null ?
              "Click the first strip edge inside the rectangle." :
              `First strip edge: ${graphSelectionFirstX.toPrecision(6)} ${axes[graphSelectionAxis]!.unit}. Click the second edge.`}</p>}
        {graphSelectionError && <p role="alert"
          data-testid="scientific-vector-region-to-graphs-error">{
            graphSelectionError}</p>}
      </div>}
      {current?.state === "current" && current.profiles ? <div role="status"
        data-testid="vector-derived-region-summary">
        <p>Vector speed: {stats(current.profiles.speed.statistics,
          current.profiles.speed.unit)}</p>
        <p>Divergence: {stats(current.profiles.derived.divergence,
          current.profiles.derived.divergence.unit)}</p>
        <p>Curl magnitude: {stats(current.profiles.derived.curlMagnitude,
          current.profiles.derived.curlMagnitude.unit)}</p>
        <p>Verified speed samples: {current.profiles.speed.samples.map(sample =>
          `${sample.name}: ${sample.sampleSha256}`).join(" · ") || "authored expression"}.
          Verified bounded stencil: {current.profiles.derived.samples.map(sample =>
            `${sample.name}: ${sample.sampleSha256}`).join(" · ") || "authored expression"}.</p>
      </div> : <p role={current?.state === "withheld" ? "alert" : "status"}
        data-testid="vector-derived-region-status">{current?.state === "withheld" ?
          `Derived region values withheld: ${current.error}` :
          "Verifying vector slice and bounded stencil…"}</p>}
      <button type="button" disabled={current?.state === "checking"} onClick={() => {
        setCheck(null); setRevision(value => value + 1);
      }}>Recheck vector region</button>
      {onPublish && <button type="button" disabled={busy || current?.state !== "current"}
        onClick={() => run(onPublish)}>Publish vector region to Project</button>}
      {onSendToGraphs && <button type="button" disabled={busy || current?.state !== "current"}
        onClick={() => run(onSendToGraphs)}>Send three vector profiles to Graphs</button>}
      {onSendToGraphs && <button type="button" disabled={busy || current?.state !== "current"}
        onClick={() => run(onSendToGraphs, 1)}>Send three vector row profiles to Graphs</button>}
      {actionError && <p role="alert">{actionError}</p>}
      {savedStatus && <p role="status" data-testid="vector-derived-region-saved-status">
        {typeof savedStatus === "object" && savedStatus.kind === "vector-derived" ?
          `Saved Project region: vector ${savedStatus.vector}, divergence ${
            savedStatus.divergence}, curl magnitude ${savedStatus.curlMagnitude}.` :
          `Saved Project region: ${typeof savedStatus === "string" ? savedStatus :
            "checking"}.`}</p>}
    </>}
  </section>;
}
