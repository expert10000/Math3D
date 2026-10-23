import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { VectorField3DArrowArtifact, VectorField3DDocument } from "@math3d/core";

export function VectorField3DArrowView({ document, artifact }: {
  document: VectorField3DDocument; artifact: VectorField3DArrowArtifact;
}) {
  const geometry = useMemo(() => {
    const axes = document.source.axes;
    const span = Math.max(...axes.map(axis => axis.max - axis.min));
    const maxMagnitude = Math.max(...artifact.arrows.map(arrow => arrow.magnitude), 1e-12);
    const positions: number[] = [], colors: number[] = [], stationary: number[] = [];
    const add = (a: number[], b: number[], color: number[]) => {
      positions.push(...a, ...b); colors.push(...color, ...color);
    };
    for (const arrow of artifact.arrows) {
      const start = arrow.position.map((value, axis) =>
        (value - (axes[axis]!.min + axes[axis]!.max) / 2) * 2 / span);
      if (arrow.kind !== "arrow") { stationary.push(...start); continue; }
      const direction = arrow.vector.map(value => value / arrow.magnitude);
      const spacing = Math.min(...axes.map((axis, index) =>
        (axis.max - axis.min) * 2 / span / Math.max(artifact.density[index] - 1, 1)));
      const length = Math.min(spacing * .74, spacing * .18 + spacing * .56 *
        Math.min(1, arrow.magnitude * artifact.magnitudeScale / maxMagnitude));
      const end = start.map((value, axis) => value + direction[axis]! * length);
      const selected = artifact.colorBy === "speed" ? arrow.magnitude :
        arrow.vector[{ p: 0, q: 1, r: 2 }[artifact.colorBy]];
      const t = artifact.colorBy === "speed" ? selected / maxMagnitude :
        (selected / maxMagnitude + 1) / 2;
      const color = [(.16 + .76 * t), (.58 - .31 * t), (.92 - .65 * t)];
      add(start, end, color);
      const basis = Math.abs(direction[2]!) < .8 ? [0, 0, 1] : [0, 1, 0];
      const side = [direction[1]! * basis[2]! - direction[2]! * basis[1]!,
        direction[2]! * basis[0]! - direction[0]! * basis[2]!,
        direction[0]! * basis[1]! - direction[1]! * basis[0]!];
      const sideLength = Math.hypot(...side);
      for (const sign of [-1, 1]) add(end, end.map((value, axis) => value -
        direction[axis]! * length * .22 + sign * side[axis]! / sideLength * length * .13), color);
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors),
      stationary: new Float32Array(stationary) };
  }, [document, artifact]);
  const maximum = Math.max(...artifact.arrows.map(arrow => arrow.magnitude), 0);
  const colorLabel = artifact.colorBy === "speed" ? `magnitude 0–${maximum.toPrecision(4)}` :
    `${artifact.colorBy.toUpperCase()} component −${maximum.toPrecision(4)}–${maximum.toPrecision(4)}`;
  return <figure aria-label="3D vector arrow renderer" className="graph2d-scientific-volume">
    <figcaption>{artifact.accepted} of {artifact.evaluated} bounded samples · {artifact.stationary} stationary ·
      {" "}{artifact.rejected} rejected · density {artifact.density.join(" × ")}</figcaption>
    <div style={{ width: "100%", height: 360, background: "#0d1726" }}>
      <Canvas camera={{ position: [2.7, 2.2, 2.7], fov: 48 }}>
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[geometry.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[geometry.colors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial vertexColors toneMapped={false} />
        </lineSegments>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[geometry.stationary, 3]} />
          </bufferGeometry>
          <pointsMaterial color="#f8b44c" size={0.055} sizeAttenuation />
        </points>
        <axesHelper args={[1.15]} />
        <OrbitControls enablePan enableZoom />
      </Canvas>
    </div>
    <p>Drag to orbit; scroll to zoom. Axes: {document.source.axes.map(axis =>
      `${axis.label} (${axis.unit})`).join(" · ")}. Components: {artifact.componentUnits.join(" · ")}.
      Color: {colorLabel}.</p>
  </figure>;
}
