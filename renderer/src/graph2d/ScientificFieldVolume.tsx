import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Graph2DScientificVolume, ScientificCoordinateSystem } from "@math3d/core";
import { ScientificFieldTransferControls } from "./ScientificFieldTransferControls";
import { scientificFieldColor, scientificFieldRange, type ScientificFieldTransfer } from "./scientificFieldTransfer";

export function ScientificFieldVolume({ volume, coordinate, label, unit, transfer, onApplyTransfer }: {
  volume: Graph2DScientificVolume; coordinate: ScientificCoordinateSystem; label: string; unit: string;
  transfer: ScientificFieldTransfer; onApplyTransfer: (transfer: ScientificFieldTransfer) => void;
}) {
  const range = scientificFieldRange(volume.values, transfer);
  const field = useMemo(() => {
    const positions = new Float32Array(volume.values.length * 3);
    const colors = new Float32Array(volume.values.length * 3);
    const extents = volume.sourceShape.map((count, axis) => (count - 1) * coordinate.spacing[axis]!);
    const scale = Math.max(...extents, 1);
    const [a, b, c] = volume.sampleShape;
    let next = 0;
    for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) for (let k = 0; k < c; k++) {
      const indices = [i, j, k], output = next * 3;
      for (let axis = 0; axis < 3; axis++) {
        const count = volume.sampleShape[axis]!, source = volume.sourceShape[axis]!;
        const original = count === 1 ? 0 : indices[axis]! * (source - 1) / (count - 1);
        positions[output + axis] = (original - (source - 1) / 2) * coordinate.spacing[axis]! * 2 / scale;
      }
      const color = scientificFieldColor(volume.values[next]!, range);
      colors[output] = color[0] / 255;
      colors[output + 1] = color[1] / 255;
      colors[output + 2] = color[2] / 255;
      next++;
    }
    return { positions, colors };
  }, [volume, coordinate, transfer]);
  return <figure className="graph2d-scientific-volume" aria-label={`Verified volume for ${label}`}>
    <figcaption>{label} ({unit}) · 3D volume overview · {volume.sampleShape.join(" × ")} displayed samples
      {volume.sampleShape.some((size, axis) => size !== volume.sourceShape[axis]) &&
        ` from ${volume.sourceShape.join(" × ")} source grid`}</figcaption>
    <div style={{ width: "100%", maxWidth: 512, height: 360, background: "#0d1726" }}>
      <Canvas camera={{ position: [2.4, 2.2, 2.4], fov: 50 }}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[field.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[field.colors, 3]} />
          </bufferGeometry>
          <pointsMaterial size={0.025} vertexColors transparent opacity={0.45} depthWrite={false} />
        </points>
        <axesHelper args={[1.25]} />
        <OrbitControls enablePan enableZoom />
      </Canvas>
    </div>
    <p>Drag to rotate; scroll to zoom. Axes: {coordinate.axes.map(axis => `${axis.name} (${axis.unit})`).join(" · ")}.</p>
    <ScientificFieldTransferControls range={range} transfer={transfer} unit={unit} onApply={onApplyTransfer}
      rangeLabel="Displayed sample range" />
    <small>Verified sample {volume.sampleSha256} · source resource {volume.resourceSha256}</small>
  </figure>;
}
