// src/components/RiemannSpherePlot.tsx
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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

const RiemannSpherePlot: React.FC<RiemannSpherePlotProps> = ({ lines, points, guideSpheres, style }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const linesGroupRef = useRef<THREE.Group | null>(null);
  const pointsGroupRef = useRef<THREE.Group | null>(null);
  const guidesGroupRef = useRef<THREE.Group | null>(null);
  const frameRef = useRef<number | null>(null);

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

    const guidesGroup = new THREE.Group();
    const linesGroup = new THREE.Group();
    const pointsGroup = new THREE.Group();
    scene.add(guidesGroup, linesGroup, pointsGroup);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
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

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      controls.dispose();
      scene.traverse(disposeObject3D);
      renderer.dispose();
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
    };
  }, []);

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

  return <div ref={mountRef} style={{ width: "100%", height: "100%", ...style }} />;
};

export default RiemannSpherePlot;
export { RiemannSpherePlot };
