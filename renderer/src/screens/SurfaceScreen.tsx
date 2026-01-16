/*
// src/screens/SurfaceScreen.tsx
import React, { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type SurfaceId =
  | "sphere"
  | "cylinder"
  | "cone"
  | "paraboloid"
  | "hyperboloid";

type SurfaceScreenProps = {
  surfaceId: SurfaceId;
};

const SurfaceScreen: React.FC<SurfaceScreenProps> = ({ surfaceId }) => {
    
  return (
    <div style={{ flex: 1, minHeight: 420 }}>
      <Canvas camera={{ position: [4, 3, 5], fov: 40 }}>
        <color attach="background" args={["#f5f5f5"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 8, 4]} intensity={0.9} />
        <axesHelper args={[2]} />
        <SurfaceMesh surfaceId={surfaceId} />
        <OrbitControls enableDamping makeDefault />
      </Canvas>
    </div>
  );
};
*/

import React, { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// include the custom graph id here:
export type SurfaceId =
  | "sphere"
  | "cylinder"
  | "cone"
  | "paraboloid"
  | "hyperboloid"
  | "graph_custom";

type SurfacesScreenProps = {
  surfaceId: SurfaceId;
};

const SurfacesScreen: React.FC<SurfacesScreenProps> = ({ surfaceId }) => {
  const [customExpr, setCustomExpr] = useState<string>("x*x - y*y");

  const isCustom = surfaceId === "graph_custom";

  return (
    <div >
      <div >
        <h3>Surface (three.js)</h3>
        <p>Rotate with mouse, scroll to zoom.</p>

        {isCustom && (
          <div style={{ marginTop: 16 }}>
            <strong>Custom- graph z = f(x, y)</strong>
            <p style={{ fontSize: 12, color: "#555" }}>
              Use JavaScript math, e.g.{" "}
              <code>x*x - y*y</code>, <code>0.3*(x*x + y*y)</code>,{" "}
              <code>Math.sin(x) * Math.cos(y)</code>.
            </p>
            <textarea
              value={customExpr}
              onChange={(e) => setCustomExpr(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                background:"green",
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: 13,
                padding: 8,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>

      <div >
        <Canvas /* camera + lights etc. */>
          <SurfaceMesh surfaceId={surfaceId} />
          <OrbitControls />
        </Canvas>
      </div>
    </div>
  );
};

export default SurfacesScreen;

/* ------------ geometry factory ------------ */

const SurfaceMesh: React.FC<{ surfaceId: SurfaceId }> = ({ surfaceId }) => {
  const geometry = useMemo(() => {
    switch (surfaceId) {
      case "sphere": {
        // Unit sphere
        return new THREE.SphereGeometry(1.2, 64, 32);
      }

      case "cylinder": {
        // Circular cylinder radius 1, height 2
        return new THREE.CylinderGeometry(1, 1, 2.4, 64, 1, true);
      }

      case "cone": {
        // Right circular cone
        return new THREE.ConeGeometry(1.2, 2.4, 64, 1, true);
      }

      case "paraboloid": {
        // Elliptic paraboloid: z = a r^2, built from a plane grid
        const geom = new THREE.PlaneGeometry(3.5, 3.5, 90, 90);
        const pos = geom.attributes.position as THREE.BufferAttribute;
        const a = 0.25;

        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const r2 = x * x + y * y;
          const z = a * r2;
          pos.setZ(i, z);
        }
        pos.needsUpdate = true;
        geom.rotateX(-Math.PI / 2); // stand it up
        geom.computeVertexNormals();
        return geom;
      }

      case "hyperboloid": {
        // Hyperboloid of one sheet, approximate parametrisation
        // using (u,v) from a plane patch
        const geom = new THREE.PlaneGeometry(3.6, 3.6, 90, 90);
        const pos = geom.attributes.position as THREE.BufferAttribute;

        const vMax = 1.2; // controls "waist"
        for (let i = 0; i < pos.count; i++) {
          const U = pos.getX(i); // in [-1.8,1.8]
          const V = pos.getY(i); // in [-1.8,1.8]

          // map to parameters
          const theta = (Math.PI * U) / 1.8; // ≈ [-π,π]
          const v = (vMax * V) / 1.8; // [-vMax, vMax]

          const ch = Math.cosh(v);
          const sh = Math.sinh(v);

          const x = ch * Math.cos(theta);
          const y = ch * Math.sin(theta);
          const z = sh;

          pos.setXYZ(i, x, z, y); // swap y<->z to stand it nicely
        }

        pos.needsUpdate = true;
        geom.computeVertexNormals();
        return geom;
      }

      default:
        return new THREE.SphereGeometry(1.2, 64, 32);
    }
  }, [surfaceId]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#0a66c2"
        metalness={0.05}
        roughness={0.35}
        
      />
    </mesh>
  );
};
