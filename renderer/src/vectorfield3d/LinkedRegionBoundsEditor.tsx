import { useState } from "react";
import type { VectorField3DAxis, VectorField3DOverlayRegion } from "@math3d/core";

/** One physical rectangle is retained while the selected verified field changes. */
export function LinkedRegionBoundsEditor({ region, axes, onChange }: {
  region: VectorField3DOverlayRegion | null;
  axes: readonly [VectorField3DAxis, VectorField3DAxis, VectorField3DAxis];
  onChange: (region: VectorField3DOverlayRegion | null) => void;
}) {
  const [error, setError] = useState("");
  if (!region) return <section aria-label="Cross-layer physical region"
    data-testid="scientific-explorer-cross-layer-region">
    <h5>Cross-layer physical region</h5>
    <p>Select two corners on a combined vector and scalar slice to compare this area across layers.</p>
  </section>;
  const planeAxes = ([0, 1, 2] as const).filter(axis => axis !== region.normalAxis);
  const update = (local: number, end: number, input: HTMLInputElement) => {
    const value = Number(input.value);
    const next = region.bounds.map(bounds => [...bounds]) as [[number, number], [number, number]];
    next[local]![end] = value;
    if (!input.value.trim() || !Number.isFinite(value) || Math.abs(value) > 1e9 ||
        next[local]![0] >= next[local]![1]) {
      setError("Enter finite bounds with minimum below maximum.");
      input.value = String(region.bounds[local]![end]);
      return;
    }
    setError(""); onChange({ ...region, bounds: next });
  };
  return <section aria-label="Cross-layer physical region"
    data-testid="scientific-explorer-cross-layer-region">
    <h5>Cross-layer physical region</h5>
    <p>One physical rectangle follows compatible vector, scalar and complex layers.
      {" "}{axes[region.normalAxis].label} = {region.fixedCoordinate}
      {" "}{axes[region.normalAxis].unit}.</p>
    <div className="vector-field3d-clip-grid">{planeAxes.map((axis, local) =>
      ([0, 1] as const).map(end => <label key={`${axis}-${end}`}>
        Region {axes[axis].label} {end === 0 ? "min" : "max"} ({axes[axis].unit})
        <input key={`${region.normalAxis}:${region.fixedCoordinate}:${region.bounds[local]![end]}`}
          type="number" step="any"
          aria-label={`Region ${axes[axis].label} ${end === 0 ? "min" : "max"}`}
          defaultValue={region.bounds[local]![end]}
          onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
          onBlur={event => update(local, end, event.currentTarget)} />
      </label>))}</div>
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={() => { setError(""); onChange(null); }}>Clear linked region</button>
  </section>;
}
