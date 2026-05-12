import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, Line, OrbitControls } from "@react-three/drei";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import type { Realization3D, Vec3 } from "./types";

type OrientationFlipOverlay = {
  trackEdgeId: string;
  startNormalEdgeId?: string;
  endNormalEdgeId?: string;
  speed?: number;
  color?: string;
};

type PresentationCamera = {
  position: [number, number, number];
  target: [number, number, number];
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
  cameraMode?: "perspective" | "orthographic";
  presentationCamera?: PresentationCamera | null;
  onEdgeHover?: (edgeId: string | null) => void;
  onEdgeSelect?: (edgeId: string) => void;
};

const toVec3 = (point: Vec3): THREE.Vector3 => new THREE.Vector3(point[0], point[1], point[2]);
const softenEdgeColor = (input: string, mix = 0.34): string => {
  const c = new THREE.Color(input);
  c.lerp(new THREE.Color("#cbd5e1"), Math.max(0, Math.min(1, mix)));
  return `#${c.getHexString()}`;
};

const StudioPostprocessing: React.FC = () => {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const ssaoPassRef = useRef<SSAOPass | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const ssaoPass = new SSAOPass(scene, camera, size.width, size.height);
    ssaoPass.kernelRadius = 12;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.18;
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(ssaoPass);
    composer.addPass(outputPass);

    composerRef.current = composer;
    ssaoPassRef.current = ssaoPass;
    return () => {
      composer.dispose();
      composerRef.current = null;
      ssaoPassRef.current = null;
    };
  }, [camera, gl, scene]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
    ssaoPassRef.current?.setSize(size.width, size.height);
  }, [size.height, size.width]);

  useFrame(() => {
    if (!composerRef.current) return;
    composerRef.current.render();
  }, 1);

  return null;
};

const PresentationCameraController: React.FC<{
  config: PresentationCamera | null;
  controlsRef: React.RefObject<{
    target: THREE.Vector3;
    update: () => void;
  } | null>;
}> = ({ config, controlsRef }) => {
  const { camera } = useThree();

  useEffect(() => {
    if (!config) return;
    camera.position.fromArray(config.position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.fromArray(config.target);
      camera.lookAt(controls.target);
      controls.update();
      return;
    }
    camera.lookAt(new THREE.Vector3(...config.target));
  }, [camera, config, controlsRef]);

  return null;
};

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
  const arrowRef = useRef<THREE.Group>(null);
  const trackVec = useMemo(() => track.map((point) => toVec3(point)), [track]);
  const arrowAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const arrowQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const shaftLength = 0.32;
  const headLength = 0.14;
  const startDir = useMemo(() => {
    if (!startNormal || startNormal.length < 2) return null;
    return toVec3(startNormal[1]).sub(toVec3(startNormal[0])).normalize();
  }, [startNormal]);
  const endDir = useMemo(() => {
    if (!endNormal || endNormal.length < 2) return null;
    return toVec3(endNormal[1]).sub(toVec3(endNormal[0])).normalize();
  }, [endNormal]);

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
    arrowQuaternion.setFromUnitVectors(arrowAxis, direction);
    arrowRef.current.quaternion.copy(arrowQuaternion);
  });

  return (
    <group>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.048, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <group ref={arrowRef}>
        <mesh position={[0, shaftLength * 0.5, 0]}>
          <cylinderGeometry args={[0.015, 0.015, shaftLength, 16]} />
          <meshStandardMaterial color={color} roughness={0.36} metalness={0.06} />
        </mesh>
        <mesh position={[0, shaftLength + headLength * 0.5, 0]}>
          <coneGeometry args={[0.045, headLength, 24]} />
          <meshStandardMaterial color={color} roughness={0.28} metalness={0.08} />
        </mesh>
      </group>
    </group>
  );
};

const FacePatch: React.FC<{
  vertices: Array<[number, number, number]>;
  triangles: Array<[number, number, number]>;
  color: string;
  studio: boolean;
}> = ({ vertices, triangles, color, studio }) => {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const flatVertices = new Float32Array(vertices.flatMap((vertex) => [vertex[0], vertex[1], vertex[2]]));
    const flatTriangles = new Uint32Array(triangles.flatMap((tri) => [tri[0], tri[1], tri[2]]));
    g.setAttribute("position", new THREE.BufferAttribute(flatVertices, 3));
    g.setIndex(new THREE.BufferAttribute(flatTriangles, 1));
    g.computeVertexNormals();
    return g;
  }, [triangles, vertices]);

  if (studio) {
    return (
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={0xd9d9d9}
          roughness={0.62}
          metalness={0.0}
          clearcoat={0.08}
          clearcoatRoughness={0.9}
          dithering
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
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

const EdgeTube: React.FC<{
  points: Vec3[];
  color: string;
  radius: number;
  onHover?: (active: boolean) => void;
  onSelect?: () => void;
}> = ({ points, color, radius, onHover, onSelect }) => {
  const pointVec = useMemo(() => points.map((point) => toVec3(point)), [points]);
  const closed = useMemo(() => {
    if (pointVec.length < 3) return false;
    return pointVec[0].distanceTo(pointVec[pointVec.length - 1]) <= radius * 4;
  }, [pointVec, radius]);
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(pointVec, closed, "catmullrom", 0.5);
    return new THREE.TubeGeometry(curve, Math.max(120, pointVec.length * 2), radius, 12, closed);
  }, [closed, pointVec, radius]);
  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover?.(true);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onHover?.(false);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
    >
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} />
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
  cameraMode = "perspective",
  presentationCamera = null,
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
  const isStudioRealization = useMemo(
    () =>
      realization.id.includes("/realization/klein-immersed") ||
      realization.id.includes("/realization/cylinder-smooth"),
    [realization.id]
  );
  const sceneBounds = useMemo(() => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const face of realization.faceRealizationMesh) {
      for (const [x, y, z] of face.vertices) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
    }
    if (!Number.isFinite(minX)) return { minY: -1.8, floorSize: 20, center: new THREE.Vector3(0, 0, 0) };
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const floorSize = Math.max(20, 2.4 * Math.max(spanX, spanZ, 1));
    const center = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    return { minY, floorSize, center };
  }, [realization.faceRealizationMesh]);
  const floorY = sceneBounds.minY - 0.48;
  const studioControlsRef = useRef<{
    target: THREE.Vector3;
    update: () => void;
  } | null>(null);
  const defaultStudioTarget: [number, number, number] = [sceneBounds.center.x, sceneBounds.center.y, sceneBounds.center.z];
  const activeCameraTarget = presentationCamera?.target ?? defaultStudioTarget;
  const cameraPosition = presentationCamera?.position ?? (isStudioRealization ? [5.2, 3.95, 5.7] : [3.6, 3.2, 3.8]);
  const useOrthographic = cameraMode === "orthographic";
  const cameraConfig = useOrthographic
    ? { position: cameraPosition as [number, number, number], zoom: 110, near: 0.1, far: 100 }
    : { position: cameraPosition as [number, number, number], fov: isStudioRealization ? 34 : 48 };

  const sceneContent = (
    <group>
      {realization.faceRealizationMesh.map((face) => (
        <FacePatch
          key={`face-${face.faceId}`}
          vertices={face.vertices}
          triangles={face.triangles}
          color={realization.style.faceFill}
          studio={isStudioRealization}
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
          const strokeColor =
            isHighlighted
              ? "#0a66c2"
              : customColor ?? (drawAsSeam ? realization.style.seamStroke : realization.style.edgeStroke);
          if (drawAsSeam) {
            return (
              <EdgeTube
                key={`edge-tube-${edgeId}`}
                points={points}
                color={strokeColor}
                radius={isStudioRealization ? (isHighlighted ? 0.036 : 0.03) : isHighlighted ? 0.03 : 0.024}
                onHover={(active) => onEdgeHover?.(active ? edgeId : null)}
                onSelect={() => onEdgeSelect?.(edgeId)}
              />
            );
          }
          return (
            <Line
              key={`edge-${edgeId}`}
              points={points}
              color={isStudioRealization ? softenEdgeColor(strokeColor, 0.45) : strokeColor}
              transparent={isStudioRealization}
              opacity={isStudioRealization ? (isHighlighted ? 0.78 : 0.62) : 1}
              lineWidth={isStudioRealization ? (isHighlighted ? 2.2 : 1.1) : isHighlighted ? 2.8 : 1.5}
              depthTest={!isStudioRealization}
              renderOrder={8}
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
            <mesh castShadow>
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
              orientationFlipOverlay.endNormalEdgeId ? realization.edgeCurves[orientationFlipOverlay.endNormalEdgeId] : undefined
            }
            speed={orientationFlipOverlay.speed}
            color={orientationFlipOverlay.color}
          />
        )}
    </group>
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
      <Canvas
        orthographic={useOrthographic}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={cameraConfig}
        onPointerMissed={() => onEdgeHover?.(null)}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <PresentationCameraController config={presentationCamera} controlsRef={studioControlsRef} />
        <color attach="background" args={["#f8fbff"]} />
        {isStudioRealization ? (
          <>
            <StudioPostprocessing />
            <hemisphereLight args={[0xffffff, 0x8899aa, 1.2]} />
            <directionalLight
              position={[4, 6, 5]}
              intensity={2.2}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-near={0.5}
              shadow-camera-far={20}
              shadow-bias={-0.00006}
              shadow-normalBias={0.02}
            />
            <directionalLight position={[-5, 3, -4]} intensity={0.8} />
            <directionalLight position={[-3, 5, 5]} intensity={1.1} />
            {sceneContent}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sceneBounds.center.x, floorY, sceneBounds.center.z]} receiveShadow>
              <planeGeometry args={[sceneBounds.floorSize, sceneBounds.floorSize]} />
              <shadowMaterial opacity={0.18} />
            </mesh>
            <OrbitControls
              ref={studioControlsRef}
              makeDefault
              enableDamping
              dampingFactor={0.08}
              enablePan={false}
              enableZoom
              autoRotate={!presentationCamera}
              autoRotateSpeed={0.35}
              minDistance={5.4}
              maxDistance={9.5}
              minPolarAngle={0.78}
              maxPolarAngle={1.24}
              target={activeCameraTarget}
            />
          </>
        ) : (
          <>
            <ambientLight intensity={0.85} />
            <directionalLight position={[4, 6, 5]} intensity={1.1} />
            <directionalLight position={[-4, -3, 2]} intensity={0.25} />
            <Bounds fit clip observe margin={1.28}>
              {sceneContent}
            </Bounds>
            <gridHelper args={[8, 16, "#dbe4f0", "#eef2f7"]} position={[0, -1.8, 0]} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
          </>
        )}
      </Canvas>
    </div>
  );
};

export default TopologyRealization3DView;
