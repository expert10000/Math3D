import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Graph2DScientificVolume, ScientificCoordinateSystem } from "@math3d/core";

export function ScientificFieldVolume({ volume, coordinate, label, unit }: {
  volume: Graph2DScientificVolume; coordinate: ScientificCoordinateSystem; label: string; unit: string;
}) {
  const field = useMemo(() => {
    let low = Infinity, high = -Infinity;
    for (const value of volume.values) { if (value < low) low = value; if (value > high) high = value; }
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
      const t = high === low ? .5 : (volume.values[next]! - low) / (high - low);
      colors[output] = (30 + 220 * t) / 255;
      colors[output + 1] = (80 + 135 * (1 - Math.abs(2 * t - 1))) / 255;
      colors[output + 2] = (235 - 205 * t) / 255;
      next++;
    }
    return { positions, colors, low, high };
  }, [volume, coordinate]);
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
    <p>Drag to rotate; scroll to zoom. Axes: {coordinate.axes.map(axis => `${axis.name} (${axis.unit})`).join(" · ")}. Blue {field.low} to red {field.high} {unit}.</p>
    <small>Verified sample {volume.sampleSha256} · source resource {volume.resourceSha256}</small>
  </figure>;
}
