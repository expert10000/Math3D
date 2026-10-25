import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { OrthographicCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { VectorField3DArrowArtifact, VectorField3DDocument,
  VectorField3DTrajectoryArtifact, VectorField3DCameraPreset,
  VectorField3DClipBounds, VectorField3DCameraState } from "@math3d/core";

const cameraPositions: Record<VectorField3DCameraPreset, readonly [number, number, number]> = {
  perspective: [2.7, 2.2, 2.7], xy: [0, 0, 4], xz: [0, 4, 0], yz: [4, 0, 0],
};
function CameraPreset({ preset, controls, onReady, savedState }: { preset: VectorField3DCameraPreset;
  savedState: VectorField3DCameraState | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
  onReady: (preset: VectorField3DCameraPreset) => void }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...(savedState?.position ?? cameraPositions[preset]));
    if (camera instanceof OrthographicCamera) camera.zoom = savedState?.zoom ?? 140;
    const up: readonly [number, number, number] = preset === "xz" || preset === "yz" ?
      [0, 0, 1] : [0, 1, 0];
    camera.up.set(...up);
    camera.lookAt(...(savedState?.target ?? [0, 0, 0]));
    camera.updateProjectionMatrix();
    controls.current?.target.set(...(savedState?.target ?? [0, 0, 0]));
    controls.current?.update();
    invalidate();
    onReady(preset);
  }, [camera, controls, invalidate, onReady, preset]);
  return null;
}
export const pointInsideFieldClip = (point: readonly number[], clip: VectorField3DClipBounds) =>
  point.every((value, axis) => value >= clip[axis]![0] && value <= clip[axis]![1]);

export function VectorField3DArrowView({ document, artifact, trajectories, probe,
  onCameraStateChange }: {
  document: VectorField3DDocument; artifact: VectorField3DArrowArtifact;
  trajectories?: VectorField3DTrajectoryArtifact | null;
  probe?: readonly [number, number, number] | null;
  onCameraStateChange?: (state: VectorField3DCameraState) => void;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const workspace = document.workspace;
  const clip = workspace?.clipBounds ?? document.source.axes.map(axis =>
    [axis.min, axis.max]) as unknown as VectorField3DClipBounds;
  const preset = workspace?.cameraPreset ?? "perspective";
  const [cameraStatus, setCameraStatus] = useState("Camera ready. Use arrow keys to orbit, + or − to zoom, Home to reset.");
  const onCameraReady = useCallback((next: VectorField3DCameraPreset) =>
    setCameraStatus(`Camera ready. Use arrow keys to orbit, + or − to zoom, Home to reset. Preset ${next}.`), []);
  const reportCamera = () => {
    const current = controls.current;
    if (!current) return;
    setCameraStatus(`Camera azimuth ${Math.round(current.getAzimuthalAngle() * 180 / Math.PI)}°, ` +
      `polar ${Math.round(current.getPolarAngle() * 180 / Math.PI)}°, ` +
      `distance ${current.getDistance().toFixed(2)}.`);
    onCameraStateChange?.({ position: [current.object.position.x, current.object.position.y,
      current.object.position.z], target: [current.target.x, current.target.y, current.target.z],
      zoom: current.object.zoom });
  };
  const moveCamera = (action: "left" | "right" | "up" | "down" | "in" | "out" | "reset") => {
    const current = controls.current;
    if (!current) return;
    const angle = Math.PI / 12;
    if (action === "left" || action === "right") current.setAzimuthalAngle(current.getAzimuthalAngle() +
      (action === "left" ? -angle : angle));
    else if (action === "up" || action === "down") current.setPolarAngle(Math.max(.1, Math.min(Math.PI - .1,
      current.getPolarAngle() + (action === "up" ? -angle : angle))));
    else if (action === "in") current.dollyIn(1.25);
    else if (action === "out") current.dollyOut(1.25);
    else {
      current.object.position.set(...cameraPositions[preset]);
      if (current.object instanceof OrthographicCamera) {
        current.object.zoom = 140;
        current.object.updateProjectionMatrix();
      }
      const up: readonly [number, number, number] = preset === "xz" || preset === "yz" ?
        [0, 0, 1] : [0, 1, 0];
      current.object.up.set(...up);
      current.target.set(0, 0, 0);
      current.object.lookAt(0, 0, 0);
    }
    current.update(); reportCamera();
  };
  const onCameraKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      "+": "in", "=": "in", "-": "out", Home: "reset" } as const)[event.key as
        "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "+" | "=" | "-" | "Home"];
    if (action) { event.preventDefault(); moveCamera(action); }
  };
  const geometry = useMemo(() => {
    const axes = document.source.axes;
    const span = Math.max(...axes.map(axis => axis.max - axis.min));
    const maxMagnitude = Math.max(...artifact.arrows.map(arrow => arrow.magnitude), 1e-12);
    const positions: number[] = [], colors: number[] = [], stationary: number[] = [];
    const add = (a: number[], b: number[], color: number[]) => {
      positions.push(...a, ...b); colors.push(...color, ...color);
    };
    for (const arrow of artifact.arrows) {
      if (!pointInsideFieldClip(arrow.position, clip)) continue;
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
  }, [document, artifact, clip]);
  const paths = useMemo(() => {
    const positions: number[] = [], colors: number[] = [];
    const axes = document.source.axes;
    const span = Math.max(...axes.map(axis => axis.max - axis.min));
    trajectories?.trajectories.forEach((trajectory, trajectoryIndex) => {
      const color = trajectoryIndex % 2 === 0 ? [1, .79, .23] : [.38, .97, .77];
      for (let index = 1; index < trajectory.points.length; index++) {
        if (!pointInsideFieldClip(trajectory.points[index - 1]!.position, clip) ||
            !pointInsideFieldClip(trajectory.points[index]!.position, clip)) continue;
        for (const point of [trajectory.points[index - 1]!, trajectory.points[index]!]) {
          positions.push(...point.position.map((value, axis) =>
            (value - (axes[axis]!.min + axes[axis]!.max) / 2) * 2 / span));
          colors.push(...color);
        }
      }
    });
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
  }, [document, trajectories, clip]);
  const domainBox = useMemo(() => {
    const axes = document.source.axes, span = Math.max(...axes.map(axis => axis.max - axis.min));
    const half = axes.map(axis => (axis.max - axis.min) / span);
    const corners = Array.from({ length: 8 }, (_, index) => [
      (index & 1 ? 1 : -1) * half[0]!, (index & 2 ? 1 : -1) * half[1]!,
      (index & 4 ? 1 : -1) * half[2]!] as const);
    const positions: number[] = [];
    for (let index = 0; index < 8; index++) for (const bit of [1, 2, 4])
      if (!(index & bit)) positions.push(...corners[index]!, ...corners[index | bit]!);
    return new Float32Array(positions);
  }, [document.source.axes]);
  const clipBox = useMemo(() => {
    const axes = document.source.axes, span = Math.max(...axes.map(axis => axis.max - axis.min));
    const ends = clip.map((bounds, axis) => bounds.map(value =>
      (value - (axes[axis]!.min + axes[axis]!.max) / 2) * 2 / span));
    const corners = Array.from({ length: 8 }, (_, index) => [
      ends[0]![index & 1 ? 1 : 0]!, ends[1]![index & 2 ? 1 : 0]!,
      ends[2]![index & 4 ? 1 : 0]!] as const);
    const positions: number[] = [];
    for (let index = 0; index < 8; index++) for (const bit of [1, 2, 4])
      if (!(index & bit)) positions.push(...corners[index]!, ...corners[index | bit]!);
    return new Float32Array(positions);
  }, [clip, document.source.axes]);
  const visibleCount = artifact.arrows.filter(arrow => pointInsideFieldClip(arrow.position, clip)).length;
  const maximum = Math.max(...artifact.arrows.map(arrow => arrow.magnitude), 0);
  const probePosition = probe?.map((value, axis) => (value -
    (document.source.axes[axis]!.min + document.source.axes[axis]!.max) / 2) * 2 /
    Math.max(...document.source.axes.map(item => item.max - item.min))) as
    [number, number, number] | undefined;
  const colorLabel = artifact.colorBy === "speed" ? `magnitude 0–${maximum.toPrecision(4)}` :
    `${artifact.colorBy.toUpperCase()} component −${maximum.toPrecision(4)}–${maximum.toPrecision(4)}`;
  return <figure aria-label="3D vector arrow renderer" className="graph2d-scientific-volume">
    <figcaption>{artifact.accepted} of {artifact.evaluated} bounded samples · {artifact.stationary} stationary ·
      {" "}{artifact.rejected} rejected · density {artifact.density.join(" × ")}</figcaption>
    <div role="group" aria-label="3D camera viewport" tabIndex={0} onKeyDown={onCameraKey}
      style={{ width: "100%", height: "100%", minHeight: 360, background: "#0d1726" }}>
      <Canvas key={preset === "perspective" ? "perspective" : "orthographic"}
        orthographic={preset !== "perspective"}
        camera={preset === "perspective" ? { position: cameraPositions[preset], fov: 48 } :
          { position: cameraPositions[preset], zoom: 140 }}>
        <CameraPreset preset={preset} controls={controls} onReady={onCameraReady}
          savedState={workspace?.cameraState ?? null} />
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
        <lineSegments>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[domainBox, 3]} /></bufferGeometry>
          <lineBasicMaterial color="#94a3b8" transparent opacity={0.7} toneMapped={false} />
        </lineSegments>
        <lineSegments>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[clipBox, 3]} /></bufferGeometry>
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.9} toneMapped={false} />
        </lineSegments>
        {probePosition && <mesh position={probePosition}>
          <sphereGeometry args={[0.055, 12, 8]} />
          <meshBasicMaterial color="#fde047" depthTest={false} />
        </mesh>}
        {paths.positions.length > 0 && <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[paths.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[paths.colors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial vertexColors toneMapped={false} depthTest={false} />
        </lineSegments>}
        <axesHelper args={[1.15]} />
        <OrbitControls ref={controls} enablePan enableZoom onEnd={reportCamera} />
      </Canvas>
    </div>
    <div role="group" aria-label="3D camera controls" className="vector-field3d-camera-controls">
      <button type="button" onClick={() => moveCamera("left")}>Orbit left</button>
      <button type="button" onClick={() => moveCamera("right")}>Orbit right</button>
      <button type="button" onClick={() => moveCamera("up")}>Orbit up</button>
      <button type="button" onClick={() => moveCamera("down")}>Orbit down</button>
      <button type="button" onClick={() => moveCamera("in")}>Zoom in</button>
      <button type="button" onClick={() => moveCamera("out")}>Zoom out</button>
      <button type="button" onClick={() => moveCamera("reset")}>Reset camera</button>
    </div>
    <p role="status" aria-live="polite" data-testid="vector-field3d-camera-status">{cameraStatus}</p>
    <p role="status" data-testid="vector-field3d-clip-status">Display clip: {visibleCount} of
      {" "}{artifact.arrows.length} accepted sample positions visible; numerical samples are unchanged.
      Camera preset {preset}. Clip box: {clip.map((bounds, axis) =>
        `${document.source.axes[axis]!.label} ${bounds[0]}…${bounds[1]} ${document.source.axes[axis]!.unit}`).join(" · ")}.
      {probe && !pointInsideFieldClip(probe, clip) && " The linked probe is outside the display clip; its coordinates and values remain available."}</p>
    <p>Domain box: {document.source.axes.map(axis =>
      `${axis.label} ${axis.min}…${axis.max} ${axis.unit}`).join(" · ")}. Drag to orbit; scroll to zoom. Axes: {document.source.axes.map(axis =>
      `${axis.label} (${axis.unit})`).join(" · ")}. Components: {artifact.componentUnits.join(" · ")}.
      Color: {colorLabel}.</p>
    {probe && <p data-testid="vector-field3d-3d-probe">Selected probe: {probe.map((value, index) =>
      `${document.source.axes[index]!.label} = ${value} ${document.source.axes[index]!.unit}`).join(" · ")}.</p>}
    {trajectories && <p>Trajectory overlay: {trajectories.trajectories.length} seed(s),
      {" "}{trajectories.trajectories.map(path => `${path.seedId}: ${path.stopReason}`).join("; ")}.
      Gold/cyan lines show adaptive numerical approximations.</p>}
  </figure>;
}
