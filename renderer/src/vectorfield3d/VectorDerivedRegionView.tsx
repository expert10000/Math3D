import { useEffect, useState } from "react";
import type { VectorField3DDocument, VectorField3DOverlayRegion,
  VectorField3DSliceArtifact } from "@math3d/core";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile } from
  "./derivedCombinedRegionProfile";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";

type Profiles = Readonly<{
  speed: Awaited<ReturnType<typeof verifiedVectorRegionProfile>>;
  derived: Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>>;
}>;
type Check = Readonly<{ document: VectorField3DDocument;
  region: VectorField3DOverlayRegion; state: "checking" | "current" | "withheld";
  profiles?: Profiles; error?: string }>;

export function VectorDerivedRegionView({ document, slice, region, onChange,
  onStartSelection, selecting, busy, onPublish, onSendToGraphs,
  savedStatus }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  region: VectorField3DOverlayRegion | null;
  onChange: (region: VectorField3DOverlayRegion | null) => void;
  onStartSelection: () => void; selecting: boolean; busy: boolean;
  onPublish?: (region: VectorField3DOverlayRegion) => Promise<void>;
  onSendToGraphs?: (region: VectorField3DOverlayRegion) => Promise<void>;
  savedStatus?: SavedRegionSourceStatus;
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
  const stats = (value: { count: number; gaps: number; mean: number | null;
    min: number | null; max: number | null }, unit: string) =>
    `${value.count}/289 samples (${value.gaps} gaps); ${value.mean === null ?
      `no finite values ${unit}` : `mean ${value.mean.toPrecision(5)}, min ${
        value.min!.toPrecision(5)}, max ${value.max!.toPrecision(5)} ${unit}`}`;
  const run = (action: (region: VectorField3DOverlayRegion) => Promise<void>) => {
    if (!region) return;
    setActionError("");
    void action(region).catch(cause => setActionError(cause instanceof Error ?
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
      <p>Physical rectangle: {axes[0]!.label} {region.bounds[0][0]} to {
        region.bounds[0][1]} {axes[0]!.unit}; {axes[1]!.label} {
        region.bounds[1][0]} to {region.bounds[1][1]} {axes[1]!.unit}; {
        document.source.axes[region.normalAxis]!.label} = {
        region.fixedCoordinate} {document.source.axes[region.normalAxis]!.unit}.</p>
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
