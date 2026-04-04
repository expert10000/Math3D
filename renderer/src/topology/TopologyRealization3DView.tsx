import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Line, OrbitControls } from "@react-three/drei";
import type { Realization3D, Vec3 } from "./types";

type OrientationFlipOverlay = {
  trackEdgeId: string;
  startNormalEdgeId?: string;
  endNormalEdgeId?: string;
  speed?: number;
  color?: string;
};

type TopologyRealization3DViewProps = {
  realization: Realization3D;
  height?: number;
  showSeams?: boolean;
  showSkeleton?: boolean;
  showSingularityMarkers?: boolean;
  edgeColorOverrides?: Record<string, string>;
  hiddenEdgeIds?: string[];
  orientationFlipOverlay?: OrientationFlipOverlay | null;
  highlightedEdgeIds?: string[];
  onEdgeHover?: (edgeId: string | null) => void;
  onEdgeSelect?: (edgeId: string) => void;
};

const toVec3 = (point: Vec3): THREE.Vector3 => new THREE.Vector3(point[0], point[1], point[2]);

const polylineSample = (points: THREE.Vector3[], t: number): { point: THREE.Vector3; tangent: THREE.Vector3 } => {
  if (points.length === 0) return { point: new THREE.Vector3(), tangent: new THREE.Vector3(1, 0, 0) };
  if (points.length === 1) return { point: points[0].clone(), tangent: new THREE.Vector3(1, 0, 0) };
  const clampedT = Math.max(0, Math.min(1, t));
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  }
  const total = lengths[lengths.length - 1] || 1;
  const target = clampedT * total;
  let seg = 1;
  while (seg < lengths.length && lengths[seg] < target) seg += 1;
  const i1 = Math.max(1, Math.min(lengths.length - 1, seg));
  const i0 = i1 - 1;
  const l0 = lengths[i0];
  const l1 = lengths[i1];
  const localT = l1 - l0 <= 1e-9 ? 0 : (target - l0) / (l1 - l0);
  const point = points[i0].clone().lerp(points[i1], localT);
  const tangent = points[i1].clone().sub(points[i0]).normalize();
  return { point, tangent: tangent.lengthSq() > 1e-9 ? tangent : new THREE.Vector3(1, 0, 0) };
};

const OrientationFlipTraveler: React.FC<{
  track: Vec3[];
  startNormal?: Vec3[];
  endNormal?: Vec3[];
  speed?: number;
  color?: string;
}> = ({ track, startNormal, endNormal, speed = 0.12, color = "#9333ea" }) => {
  const markerRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.ArrowHelper>(null);
  const trackVec = useMemo(() => track.map((point) => toVec3(point)), [track]);
  const startDir = useMemo(() => {
    if (!startNormal || startNormal.length < 2) return null;
    return toVec3(startNormal[1]).sub(toVec3(startNormal[0])).normalize();
  }, [startNormal]);
  const endDir = useMemo(() => {
    if (!endNormal || endNormal.length < 2) return null;
    return toVec3(endNormal[1]).sub(toVec3(endNormal[0])).normalize();
  }, [endNormal]);
  const arrowObj = useMemo(
    () => new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0.46, color, 0.12, 0.08),
    [color]
  );

  useFrame(({ clock }) => {
    if (!markerRef.current || !arrowRef.current || trackVec.length < 2) return;
    const t = ((clock.getElapsedTime() * speed) % 1 + 1) % 1;
    const sample = polylineSample(trackVec, t);
    let direction = sample.tangent.clone();
    if (startDir && endDir) {
      direction = startDir.clone().lerp(endDir, t).normalize();
      if (direction.lengthSq() <= 1e-9) direction = sample.tangent.clone();
    }
    markerRef.current.position.copy(sample.point);
    arrowRef.current.position.copy(sample.point);
    arrowRef.current.setDirection(direction);
    arrowRef.current.setLength(0.46, 0.12, 0.08);
  });

  return (
    <group>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.048, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <primitive object={arrowObj} ref={arrowRef} />
    </group>
  );
};

const FacePatch: React.FC<{
  vertices: Array<[number, number, number]>;
  triangles: Array<[number, number, number]>;
  color: string;
}> = ({ vertices, triangles, color }) => {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const flatVertices = new Float32Array(vertices.flatMap((vertex) => [vertex[0], vertex[1], vertex[2]]));
    const flatTriangles = new Uint32Array(triangles.flatMap((tri) => [tri[0], tri[1], tri[2]]));
    g.setAttribute("position", new THREE.BufferAttribute(flatVertices, 3));
    g.setIndex(new THREE.BufferAttribute(flatTriangles, 1));
    g.computeVertexNormals();
    return g;
  }, [triangles, vertices]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.48}
        side={THREE.DoubleSide}
        roughness={0.6}
        metalness={0.05}
      />
    </mesh>
  );
};

export const TopologyRealization3DView: React.FC<TopologyRealization3DViewProps> = ({
  realization,
  height = 380,
  showSeams = true,
  showSkeleton = true,
  showSingularityMarkers = true,
  edgeColorOverrides = {},
  hiddenEdgeIds = [],
  orientationFlipOverlay = null,
  highlightedEdgeIds = [],
  onEdgeHover,
  onEdgeSelect,
}) => {
  const seamSet = useMemo(() => new Set(realization.seams.map((seam) => seam.edgeId)), [realization.seams]);
  const hiddenSet = useMemo(() => new Set(hiddenEdgeIds), [hiddenEdgeIds]);
  const highlightedSet = useMemo(() => new Set(highlightedEdgeIds), [highlightedEdgeIds]);
  const singularitySet = useMemo(
    () =>
      new Map(realization.singularityMarkers.map((marker) => [marker.vertexId, marker])),
    [realization.singularityMarkers]
  );

  return (
    <div
      style={{
        width: "100%",
        height,
        border: "1px solid #dbe4f0",
        borderRadius: 10,
        overflow: "hidden",
        background: "#f8fbff",
      }}
    >
      <Canvas camera={{ position: [3.6, 3.2, 3.8], fov: 48 }} onPointerMissed={() => onEdgeHover?.(null)}>
        <color attach="background" args={["#f8fbff"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 6, 5]} intensity={1.1} />
        <directionalLight position={[-4, -3, 2]} intensity={0.25} />

        <Bounds fit clip observe margin={1.28}>
          <group>
            {realization.faceRealizationMesh.map((face) => (
              <FacePatch
                key={`face-${face.faceId}`}
                vertices={face.vertices}
                triangles={face.triangles}
                color={realization.style.faceFill}
              />
            ))}

            {showSkeleton &&
              Object.entries(realization.edgeCurves).map(([edgeId, points]) => {
                if (points.length < 2) return null;
                if (hiddenSet.has(edgeId)) return null;
                const isSeam = seamSet.has(edgeId);
                const customColor = edgeColorOverrides[edgeId];
                const drawAsSeam = isSeam && showSeams;
                const isHighlighted = highlightedSet.has(edgeId);
                return (
                  <Line
                    key={`edge-${edgeId}`}
                    points={points}
                    color={
                      isHighlighted
                        ? "#0a66c2"
                        : customColor ?? (drawAsSeam ? realization.style.seamStroke : realization.style.edgeStroke)
                    }
                    lineWidth={drawAsSeam ? (isHighlighted ? 3.8 : 2.4) : isHighlighted ? 2.8 : 1.5}
                    dashed={drawAsSeam}
                    dashSize={drawAsSeam ? 0.18 : undefined}
                    gapSize={drawAsSeam ? 0.11 : undefined}
                    depthTest={false}
                    renderOrder={drawAsSeam ? 9 : 8}
                    onPointerOver={(event) => {
                      event.stopPropagation();
                      onEdgeHover?.(edgeId);
                    }}
                    onPointerOut={(event) => {
                      event.stopPropagation();
                      onEdgeHover?.(null);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdgeSelect?.(edgeId);
                    }}
                  />
                );
              })}

            {Object.entries(realization.vertexPositions).map(([vertexId, point]) => {
              const marker = singularitySet.get(vertexId);
              return (
                <group key={`vertex-${vertexId}`} position={point}>
                  <mesh>
                    <sphereGeometry args={[0.038, 12, 12]} />
                    <meshStandardMaterial color="#0f172a" />
                  </mesh>
                  {showSingularityMarkers && marker && (
                    <mesh>
                      <sphereGeometry args={[0.064, 16, 16]} />
                      <meshBasicMaterial color={realization.style.singularityColor} wireframe />
                    </mesh>
                  )}
                </group>
              );
            })}

            {orientationFlipOverlay &&
              realization.edgeCurves[orientationFlipOverlay.trackEdgeId] &&
              !hiddenSet.has(orientationFlipOverlay.trackEdgeId) && (
                <OrientationFlipTraveler
                  track={realization.edgeCurves[orientationFlipOverlay.trackEdgeId]}
                  startNormal={
                    orientationFlipOverlay.startNormalEdgeId
                      ? realization.edgeCurves[orientationFlipOverlay.startNormalEdgeId]
                      : undefined
                  }
                  endNormal={
                    orientationFlipOverlay.endNormalEdgeId
                      ? realization.edgeCurves[orientationFlipOverlay.endNormalEdgeId]
                      : undefined
                  }
                  speed={orientationFlipOverlay.speed}
                  color={orientationFlipOverlay.color}
                />
              )}
          </group>
        </Bounds>

        <gridHelper args={[8, 16, "#dbe4f0", "#eef2f7"]} position={[0, -1.8, 0]} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
};

export default TopologyRealization3DView;
