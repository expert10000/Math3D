// src/components/RiemannSpherePlot.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { sphereToStereographic } from "../math/riemannSphere";
import AxisGizmo from "./AxisGizmo";
import { applyCameraOrientation, CAMERA_ORIENTATION_LABEL, orbitCameraAroundTarget, type CameraOrientation } from "./cameraOrientation";

export type SphereLine = {
  points: { x: number; y: number; z: number }[];
  color?: number;
  opacity?: number;
};

export type SpherePoint = {
  x: number;
  y: number;
  z: number;
  color?: number;
  size?: number;
};

export type SphereGuide = {
  center: { x: number; y: number; z: number };
  radius?: number;
  color?: number;
  opacity?: number;
  wireframe?: boolean;
};

type RiemannSpherePlotProps = {
  lines?: SphereLine[] | null;
  points?: SpherePoint[] | null;
  guideSpheres?: SphereGuide[] | null;
  sphereSurfaceColoring?: {
    enabled: boolean;
    opacity?: number;
    // Returns hex RGB (0xRRGGBB) for a sphere point and its stereographic z (null at north pole/infinity).
    colorFor?: (
      spherePoint: { x: number; y: number; z: number },
      z: { re: number; im: number } | null
    ) => number | null;
  } | null;
  showCameraGizmo?: boolean;
  style?: React.CSSProperties;
};

const BASE_SPHERE_SEGMENTS = 48;
const DEFAULT_POINT_SIZE = 0.045;

const disposeObject3D = (obj: THREE.Object3D) => {
  const anyObj = obj as any;
  if (anyObj.geometry && typeof anyObj.geometry.dispose === "function") {
    anyObj.geometry.dispose();
  }
  const mat = anyObj.material as THREE.Material | THREE.Material[] | undefined;
  if (mat) {
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  }
};

const clearGroup = (group: THREE.Group | null) => {
  if (!group) return;
  const children = [...group.children];
  children.forEach((child) => {
    child.traverse(disposeObject3D);
    group.remove(child);
  });
};

const RiemannSpherePlot: React.FC<RiemannSpherePlotProps> = ({
  lines,
  points,
  guideSpheres,
  sphereSurfaceColoring,
  showCameraGizmo = false,
  style,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const linesGroupRef = useRef<THREE.Group | null>(null);
  const pointsGroupRef = useRef<THREE.Group | null>(null);
  const guidesGroupRef = useRef<THREE.Group | null>(null);
  const baseSphereRef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial> | null>(null);
  const frameRef = useRef<number | null>(null);
  const [viewerRevision, setViewerRevision] = useState(0);
  const [viewMode, setViewMode] = useState<"free" | CameraOrientation>("free");
  const [orbitLocked, setOrbitLocked] = useState(false);

  const handleGizmoOrbit = useCallback((deltaX: number, deltaY: number) => {
    if (orbitLocked) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !orbitCameraAroundTarget(camera, controls, deltaX, deltaY)) return;
    setViewMode((current) => (current === "free" ? current : "free"));
  }, [orbitLocked]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    controls.enableRotate = !orbitLocked;
    if (viewMode !== "free") applyCameraOrientation(camera, controls, new THREE.Vector3(), 1.55, viewMode);
  }, [orbitLocked, viewMode, viewerRevision]);

  const pointBuckets = useMemo(() => {
    if (!points?.length) return [];
    const buckets = new Map<number, SpherePoint[]>();
    for (const pt of points) {
      const size = Number.isFinite(pt.size) ? (pt.size as number) : DEFAULT_POINT_SIZE;
      const key = Math.round(size * 1000) / 1000;
      const list = buckets.get(key) ?? [];
      list.push(pt);
      buckets.set(key, list);
    }
    return [...buckets.entries()].map(([size, pts]) => ({ size, pts }));
  }, [points]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
    camera.position.set(2.3, 1.6, 2.3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.update();

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(2.5, 2, 2.5);
    scene.add(ambient, key);

    const sphereGeom = new THREE.SphereGeometry(1, BASE_SPHERE_SEGMENTS, Math.floor(BASE_SPHERE_SEGMENTS * 0.7));
    const sphereMat = new THREE.MeshPhongMaterial({
      color: 0xf3f4f8,
      transparent: true,
      opacity: 0.35,
      shininess: 70,
    });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    scene.add(sphere);
    baseSphereRef.current = sphere;

    const guidesGroup = new THREE.Group();
    const linesGroup = new THREE.Group();
    const pointsGroup = new THREE.Group();
    scene.add(guidesGroup, linesGroup, pointsGroup);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    setViewerRevision((revision) => revision + 1);
    guidesGroupRef.current = guidesGroup;
    linesGroupRef.current = linesGroup;
    pointsGroupRef.current = pointsGroup;

    const resize = () => {
      if (!mount) return;
      const { width, height } = mount.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    const handleControlsStart = () => {
      if (controls.enableRotate) setViewMode("free");
    };
    controls.addEventListener("start", handleControlsStart);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      controls.removeEventListener("start", handleControlsStart);
      controls.dispose();
      scene.traverse(disposeObject3D);
      renderer.setAnimationLoop(null);
      renderer.renderLists.dispose();
      renderer.dispose();
      (renderer as { forceContextLoss?: () => void }).forceContextLoss?.();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      guidesGroupRef.current = null;
      linesGroupRef.current = null;
      pointsGroupRef.current = null;
      baseSphereRef.current = null;
    };
  }, []);

  useEffect(() => {
    const sphere = baseSphereRef.current;
    if (!sphere) return;
    const geometry = sphere.geometry;
    const material = sphere.material;
    const positions = geometry.getAttribute("position");
    const colorFn = sphereSurfaceColoring?.colorFor;
    const enabled = !!sphereSurfaceColoring?.enabled && typeof colorFn === "function";

    if (!enabled || !positions) {
      material.vertexColors = false;
      material.color.setHex(0xf3f4f8);
      material.opacity = 0.35;
      material.needsUpdate = true;
      return;
    }

    const count = positions.count;
    let colorsAttr = geometry.getAttribute("color") as THREE.BufferAttribute | null;
    if (!colorsAttr || colorsAttr.count !== count) {
      colorsAttr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
      geometry.setAttribute("color", colorsAttr);
    }
    const colors = colorsAttr.array as Float32Array;
    const tmpColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const stereographic = sphereToStereographic({ x, y, z });
      const hex = colorFn(
        { x, y, z },
        stereographic ? { re: stereographic.re, im: stereographic.im } : null
      );
      tmpColor.setHex(hex ?? 0xe5e7eb);
      colors[3 * i] = tmpColor.r;
      colors[3 * i + 1] = tmpColor.g;
      colors[3 * i + 2] = tmpColor.b;
    }
    colorsAttr.needsUpdate = true;
    material.vertexColors = true;
    material.color.setHex(0xffffff);
    material.opacity = Number.isFinite(sphereSurfaceColoring?.opacity)
      ? (sphereSurfaceColoring?.opacity as number)
      : 0.95;
    material.needsUpdate = true;
  }, [sphereSurfaceColoring]);

  useEffect(() => {
    const group = linesGroupRef.current;
    if (!group) return;
    clearGroup(group);

    if (!lines?.length) return;
    for (const line of lines) {
      if (!line.points || line.points.length < 2) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(
        line.points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      );
      const material = new THREE.LineBasicMaterial({
        color: line.color ?? 0x1f77b4,
        transparent: true,
        opacity: line.opacity ?? 0.85,
      });
      const lineObj = new THREE.Line(geometry, material);
      group.add(lineObj);
    }
  }, [lines]);

  useEffect(() => {
    const group = pointsGroupRef.current;
    if (!group) return;
    clearGroup(group);

    if (!pointBuckets.length) return;
    for (const bucket of pointBuckets) {
      const { pts, size } = bucket;
      if (!pts.length) continue;
      const positions = new Float32Array(pts.length * 3);
      const colors = new Float32Array(pts.length * 3);
      const color = new THREE.Color();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        positions[3 * i] = pt.x;
        positions[3 * i + 1] = pt.y;
        positions[3 * i + 2] = pt.z;
        color.setHex(pt.color ?? 0x111111);
        colors[3 * i] = color.r;
        colors[3 * i + 1] = color.g;
        colors[3 * i + 2] = color.b;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
      });
      const pointsObj = new THREE.Points(geometry, material);
      group.add(pointsObj);
    }
  }, [pointBuckets]);

  useEffect(() => {
    const group = guidesGroupRef.current;
    if (!group) return;
    clearGroup(group);

    if (!guideSpheres?.length) return;
    for (const guide of guideSpheres) {
      const radius = Number.isFinite(guide.radius) ? (guide.radius as number) : 1;
      const geometry = new THREE.SphereGeometry(radius, 32, 20);
      const material = new THREE.MeshBasicMaterial({
        color: guide.color ?? 0x9ca3af,
        transparent: true,
        opacity: guide.opacity ?? 0.2,
        wireframe: guide.wireframe ?? true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(guide.center.x, guide.center.y, guide.center.z);
      group.add(mesh);
    }
  }, [guideSpheres]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {showCameraGizmo && (
        <div style={{ position: "absolute", left: 8, bottom: 8, zIndex: 2, borderRadius: 10, background: "rgba(248,251,255,0.95)", border: "1px solid rgba(134,153,179,0.52)", boxShadow: "0 8px 16px rgba(30,45,70,0.14)", padding: 6, display: "grid", gap: 4, width: 118, userSelect: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, fontWeight: 800, letterSpacing: "0.1em", color: "#607086" }}>
            <span>VIEW</span><span style={{ letterSpacing: 0 }}>{viewMode === "free" ? "Free" : CAMERA_ORIENTATION_LABEL[viewMode]}</span>
          </div>
          <AxisGizmo size={104} activeView={viewMode} getMainCamera={() => cameraRef.current} onSelectView={setViewMode} onFitScene={() => {
            const camera = cameraRef.current;
            const controls = controlsRef.current;
            if (!camera || !controls) return;
            const direction = camera.position.clone().sub(controls.target).normalize();
            camera.position.copy(direction.multiplyScalar(3.4));
            controls.target.set(0, 0, 0);
            camera.lookAt(controls.target);
            controls.update();
          }} onOrbit={handleGizmoOrbit} />
          <div style={{ display: "flex", gap: 5 }}>
            <button type="button" onClick={() => setOrbitLocked((locked) => !locked)} aria-pressed={orbitLocked} style={{ flex: 1, height: 24, borderRadius: 6, border: `1px solid ${orbitLocked ? "#2962d9" : "rgba(128,146,171,0.58)"}`, background: orbitLocked ? "#e3efff" : "#fff", color: orbitLocked ? "#1d4ed8" : "#495669", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>{orbitLocked ? "Locked" : "Orbit"}</button>
            <button type="button" onClick={() => { const camera = cameraRef.current; const controls = controlsRef.current; if (!camera || !controls) return; const direction = camera.position.clone().sub(controls.target).normalize(); camera.position.copy(direction.multiplyScalar(3.4)); controls.target.set(0, 0, 0); camera.lookAt(controls.target); controls.update(); }} style={{ width: 31, height: 24, borderRadius: 6, border: "1px solid rgba(128,146,171,0.58)", background: "#fff", color: "#495669", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>Fit</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiemannSpherePlot;
export { RiemannSpherePlot };
