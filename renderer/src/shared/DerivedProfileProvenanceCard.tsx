import type { DerivedProfileProvenance } from "@math3d/core";

const reasonText: Record<NonNullable<DerivedProfileProvenance["reason"]>, string> = {
  "not-computed": "No profile result has been computed for this verified recipe.",
  "source-changed": "The source revision or hash changed. Recompute from the current source and recipe.",
  "source-unverified": "The source cannot be verified. Profile values are withheld until verification succeeds.",
  "source-missing": "The saved source is missing. Profile values are withheld.",
  "recipe-changed": "An operation or its input changed. The saved profile result no longer matches this recipe.",
  "result-mismatch": "The available result does not match the pinned source and recipe.",
};

/** The identical Project provenance readout is mounted in Explorer and Graphs. */
export function DerivedProfileProvenanceCard({ provenance, view, onCompute, busy = false,
  progress, error }: { provenance: DerivedProfileProvenance; view: "explorer" | "graphs";
  onCompute?: () => void; busy?: boolean; progress?: string; error?: string }) {
  const { source, operations, plane, line } = provenance;
  return <section aria-label={`${view === "graphs" ? "Graphs" : "Explorer"} derived profile provenance`}
    data-testid={`${view}-derived-profile-provenance`} data-profile-id={provenance.profileId} tabIndex={-1}>
    <h4>{provenance.title}</h4>
    <p><strong>Status:</strong> {provenance.status === "current" ? "Current" : "Values withheld"}</p>
    {provenance.reason && <p role="status">{reasonText[provenance.reason]}</p>}
    <dl>
      <dt>Pinned source ID</dt><dd>{source.documentId}</dd>
      <dt>Pinned revision</dt><dd>{source.revision}</dd>
      <dt>Pinned hash</dt><dd>{source.structuralHash}</dd>
      {source.currentRevision !== null && source.currentRevision !== source.revision &&
        <><dt>Current source revision</dt><dd>{source.currentRevision}</dd></>}
      {source.currentStructuralHash && source.currentStructuralHash !== source.structuralHash &&
        <><dt>Current source hash</dt><dd>{source.currentStructuralHash}</dd></>}
      <dt>Operations</dt><dd>{operations.map(item => item.operation.kind).join(" → ")}</dd>
      <dt>Plane</dt><dd>{plane.axis} = {plane.coordinate} {plane.unit}</dd>
      <dt>Line</dt><dd>{line.varyingAxis} = {line.extent[0]}…{line.extent[1]} {line.varyingUnit};
        {" "}{line.fixedAxis} = {line.fixedCoordinate} {line.fixedUnit}</dd>
      <dt>Interpolation</dt><dd>{line.interpolation}</dd>
      <dt>Samples</dt><dd>{line.samples} specified; {provenance.availableRows} available</dd>
      <dt>Output unit</dt><dd>{provenance.outputUnit}</dd>
      {provenance.method && <><dt>Result method</dt><dd>{provenance.method}</dd></>}
      {provenance.coverage && <><dt>Verified transfer coverage</dt><dd>{provenance.coverage.map(part =>
        `${part.name}: ${part.sampleSha256}${part.verifiedChunks === undefined ? "" :
          `, ${part.verifiedChunks}/${part.totalChunks} chunks`}${part.verifiedTiles === undefined ? "" :
          `, ${part.verifiedTiles}/${part.totalTiles} tiles`}`).join("; ")}</dd></>}
    </dl>
    {onCompute && <button type="button" disabled={busy ||
      provenance.reason === "source-missing" || provenance.reason === "source-changed" ||
      provenance.reason === "recipe-changed"} onClick={onCompute}>
      {busy ? "Computing profile…" : "Compute profile"}</button>}
    {progress && <p role="status">{progress}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
