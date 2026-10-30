import { useEffect, useState } from "react";
import { canonicalJsonStringify, type VectorField3DDocument, type VectorField3DOverlayRegion,
  type VectorField3DSliceArtifact } from "@math3d/core";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile } from
  "./derivedCombinedRegionProfile";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import { vectorDerivedRegionSeries } from "./linkedVectorDerivedRegionGraphs";

type Profiles = Readonly<{
  speed: Awaited<ReturnType<typeof verifiedVectorRegionProfile>>;
  derived: Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>>;
}>;
type Check = Readonly<{ document: VectorField3DDocument;
  region: VectorField3DOverlayRegion; state: "checking" | "current" | "withheld";
  profiles?: Profiles; error?: string }>;

export function VectorDerivedRegionView({ document, slice, region, onChange,
  onStartSelection, selecting, busy, onPublish, onSendToGraphs,
  savedStatus, linkedRegionFocus, graphSelectionMode = null,
  graphSelectionFirstX = null, graphSelectionBusy = false,
  graphSelectionAxis = 0, graphSelectionError = "", onGraphSelectionMode }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  region: VectorField3DOverlayRegion | null;
  onChange: (region: VectorField3DOverlayRegion | null) => void;
  onStartSelection: () => void; selecting: boolean; busy: boolean;
  onPublish?: (region: VectorField3DOverlayRegion) => Promise<void>;
  onSendToGraphs?: (region: VectorField3DOverlayRegion,
    profileAxis?: 0 | 1) => Promise<void>;
  savedStatus?: SavedRegionSourceStatus;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
  graphSelectionMode?: "point" | "interval" | null;
  graphSelectionFirstX?: number | null;
  graphSelectionAxis?: 0 | 1;
  graphSelectionBusy?: boolean;
  graphSelectionError?: string;
  onGraphSelectionMode?: (mode: "point" | "interval" | null,
    axis?: 0 | 1) => void;
}) {
  const [check, setCheck] = useState<Check | null>(null);
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState("");
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
  const subrectangle = intersectionCurrent && intersection && current?.profiles ? (() => {
    const [i0, i1] = intersection.columns, [j0, j1] = intersection.rows;
    const count = (i1 - i0 + 1) * (j1 - j0 + 1);
    const fields = [
      ["vector", current.profiles.speed.cells, current.profiles.speed.unit],
      ["divergence", current.profiles.derived.divergence.cells,
        current.profiles.derived.divergence.unit],
      ["curl-magnitude", current.profiles.derived.curlMagnitude.cells,
        current.profiles.derived.curlMagnitude.unit] ] as const;
    if (fields.some(([, cells]) => cells.length !== 289)) return null;
    return { count, fields: fields.map(([name, cells, unit]) => {
      const values: number[] = [];
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const value = cells[i * 17 + j];
        if (value !== null && value !== undefined && Number.isFinite(value))
          values.push(value);
      }
      return { name, unit, available: values.length, gaps: count - values.length,
        mean: values.length ? values.reduce((sum, value) => sum + value, 0) /
          values.length : null };
    }) };
  })() : null;
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
          {" "}{subrectangle.count} lattice positions.</p>
        <ul>{subrectangle.fields.map(field => <li key={field.name}
          data-series={field.name}>{field.name}: {field.available}/{subrectangle.count}
          {" "}available ({field.gaps} gaps), {field.unit}; mean {
            field.mean === null ? "no finite value" : field.mean.toPrecision(6)}.</li>)}</ul>
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
