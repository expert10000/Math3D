import React, { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, Line, OrbitControls } from "@react-three/drei";
import type { Realization3D } from "./types";

type TopologyRealization3DViewProps = {
  realization: Realization3D;
  height?: number;
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
}) => {
  const seamSet = useMemo(() => new Set(realization.seams.map((seam) => seam.edgeId)), [realization.seams]);
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
      <Canvas camera={{ position: [3.6, 3.2, 3.8], fov: 48 }}>
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

            {Object.entries(realization.edgeCurves).map(([edgeId, points]) => {
              if (points.length < 2) return null;
              const isSeam = seamSet.has(edgeId);
              return (
                <Line
                  key={`edge-${edgeId}`}
                  points={points}
                  color={isSeam ? realization.style.seamStroke : realization.style.edgeStroke}
                  lineWidth={isSeam ? 2.4 : 1.5}
                  dashed={isSeam}
                  dashSize={isSeam ? 0.18 : undefined}
                  gapSize={isSeam ? 0.11 : undefined}
                  depthTest={false}
                  renderOrder={isSeam ? 9 : 8}
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
                  {marker && (
                    <mesh>
                      <sphereGeometry args={[0.064, 16, 16]} />
                      <meshBasicMaterial color={realization.style.singularityColor} wireframe />
                    </mesh>
                  )}
                </group>
              );
            })}
          </group>
        </Bounds>

        <gridHelper args={[8, 16, "#dbe4f0", "#eef2f7"]} position={[0, -1.8, 0]} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
};

export default TopologyRealization3DView;

