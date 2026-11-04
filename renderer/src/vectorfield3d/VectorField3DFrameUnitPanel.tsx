import { useState } from "react";
import { convertCartesianPoint, frameUnitContractFromVectorField,
  planCartesianUnitConversion, type VectorField3DDocument } from "@math3d/core";

export function VectorField3DFrameUnitPanel({ document }: { document: VectorField3DDocument }) {
  const contract = frameUnitContractFromVectorField(document);
  const [lengthUnit, setLengthUnit] = useState(document.source.axes[0].unit);
  const [timeUnit, setTimeUnit] = useState(document.source.timeUnit);
  let preview: string;
  try {
    const plan = planCartesianUnitConversion(contract,
      { coordinates: [lengthUnit, lengthUnit, lengthUnit], time: timeUnit });
    preview = `Explicit plan ${plan.planHash.slice(7, 19)} · source point (1, 1, 1) → (${convertCartesianPoint(plan,
      [1, 1, 1]).join(", ")}) ${lengthUnit}; Jacobian entries use component/coordinate scales.`;
  } catch (cause) { preview = `Conversion unavailable: ${cause instanceof Error ? cause.message : String(cause)}`; }
  return <section aria-label="Coordinate frame and units" data-testid="gf21-frame-unit">
    <h5>Coordinate frame and units</h5>
    <p>Right-handed Cartesian · source revision {contract.source.revision} ·
      {" "}{contract.source.structuralHash}. Physical derivatives use source coordinates;
      exports must name physical coordinates and units.</p>
    <p>Axes {contract.units.coordinates.join(", ")}; components {contract.units.components.join(", ")};
      {" "}time {contract.units.time}. Legacy sources keep these units unchanged.</p>
    <label>Preview length unit <select value={lengthUnit} onChange={event => setLengthUnit(event.target.value)}>
      {[...new Set([document.source.axes[0].unit, "mm", "cm", "m", "km"])].map(unit =>
        <option key={unit} value={unit}>{unit}</option>)}
    </select></label>
    <label>Preview time unit <select value={timeUnit} onChange={event => setTimeUnit(event.target.value)}>
      {[...new Set([document.source.timeUnit, "ms", "s", "min", "h"])].map(unit =>
        <option key={unit} value={unit}>{unit}</option>)}
    </select></label>
    <p role="status">{preview}</p>
  </section>;
}
