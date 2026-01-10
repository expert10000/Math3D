import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { scalarToColor01, type ColorPalette } from "./colorPalette";
import type { GaussColorMode, GaussPoint } from "./gaussMapUtils";

type GaussMapPanelProps = {
  points: GaussPoint[];
  palette: ColorPalette;
  colorMode: GaussColorMode;
  probeNormal?: { x: number; y: number; z: number } | null;
  onPointHover?: (index: number | null) => void;
  width?: number;
  height?: number;
};

const POINT_SIZE = 0.04;
const SPHERE_SEGMENTS = 56;

const buildPointGeometry = (extras: Float32Array, colors: Float32Array) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(extras, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
};

const buildPointsColor = (
  data: GaussPoint[],
  palette: ColorPalette,
  colorMode: GaussColorMode
) => {
  const positions = new Float32Array(data.length * 3);
  const colors = new Float32Array(data.length * 3);

  for (let i = 0; i < data.length; i++) {
    const normal = data[i].normal;
    const len = Math.hypot(normal.x, normal.y, normal.z);
    const nx = len > 0 ? normal.x / len : 0;
    const ny = len > 0 ? normal.y / len : 0;
    const nz = len > 0 ? normal.z / len : 0;

    positions[3 * i] = nx;
    positions[3 * i + 1] = ny;
    positions[3 * i + 2] = nz;

    const color =
      colorMode === "components"
        ? {
            r: 0.5 * (nx + 1),
            g: 0.5 * (ny + 1),
            b: 0.5 * (nz + 1),
          }
        : scalarToColor01((nz + 1) * 0.5, palette);

    colors[3 * i] = color.r;
    colors[3 * i + 1] = color.g;
    colors[3 * i + 2] = color.b;
  }

  return { positions, colors };
};

const createHighlightMesh = (color: number) => {
  const geom = new THREE.SphereGeometry(POINT_SIZE, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 10;
  mesh.visible = false;
  return mesh;
};

const GaussMapPanel: React.FC<GaussMapPanelProps> = ({
  points,
  palette,
  colorMode,
  probeNormal,
  onPointHover,
  width = 280,
  height = 280,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const hoverRef = useRef<THREE.Mesh | null>(null);
  const probeRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.5, 2.5, 2.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
      new THREE.MeshBasicMaterial({ color: 0x8797bd, transparent: true, opacity: 0.2, wireframe: true })
    );
    scene.add(sphere);

    const hoverMesh = createHighlightMesh(0xffff66);
    hoverRef.current = hoverMesh;
    scene.add(hoverMesh);

    const probeMesh = createHighlightMesh(0xff5d73);
    probeRef.current = probeMesh;
    scene.add(probeMesh);

    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.035;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const pointsMesh = pointsRef.current;
      if (!pointsMesh || !points.length) {
        setHoverIndex(null);
        onPointHover?.(null);
        return;
      }

      const intersects = raycaster.intersectObject(pointsMesh);
      if (!intersects.length || typeof intersects[0].index !== "number") {
        setHoverIndex(null);
        onPointHover?.(null);
        return;
      }

      const idx = intersects[0].index;
      setHoverIndex(idx);
      onPointHover?.(idx);
    };

    const handlePointerLeave = () => {
      setHoverIndex(null);
      onPointHover?.(null);
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const rect = mount.getBoundingClientRect();
      const w = rect.width || width;
      const h = rect.height || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      hoverMesh.geometry.dispose();
      (hoverMesh.material as THREE.Material).dispose();
      probeMesh.geometry.dispose();
      (probeMesh.material as THREE.Material).dispose();
    };
  }, [height, width, onPointHover, points.length]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) return;

    if (pointsRef.current) {
      scene.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      (pointsRef.current.material as THREE.Material).dispose();
      pointsRef.current = null;
    }

    if (!points.length) return;

    const { positions, colors } = buildPointsColor(points, palette, colorMode);
    const geom = buildPointGeometry(positions, colors);

    const mat = new THREE.PointsMaterial({
      size: POINT_SIZE,
      vertexColors: true,
      sizeAttenuation: false,
    });

    const pts = new THREE.Points(geom, mat);
    pts.renderOrder = 5;
    scene.add(pts);
    pointsRef.current = pts;
  }, [points, palette, colorMode]);

  useEffect(() => {
    const hover = hoverRef.current;
    if (!hover) return;
    if (hoverIndex == null || hoverIndex < 0 || hoverIndex >= points.length) {
      hover.visible = false;
      return;
    }

    const normal = points[hoverIndex].normal;
    const len = Math.hypot(normal.x, normal.y, normal.z);
    hover.position.set(
      len > 0 ? normal.x / len : 0,
      len > 0 ? normal.y / len : 0,
      len > 0 ? normal.z / len : 0
    );
    hover.visible = true;
  }, [hoverIndex, points]);

  useEffect(() => {
    setHoverIndex(null);
    onPointHover?.(null);
  }, [points, onPointHover]);

  useEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    if (!probeNormal) {
      probe.visible = false;
      return;
    }

    const len = Math.hypot(probeNormal.x, probeNormal.y, probeNormal.z);
    probe.position.set(
      len > 0 ? probeNormal.x / len : 0,
      len > 0 ? probeNormal.y / len : 0,
      len > 0 ? probeNormal.z / len : 0
    );
    probe.visible = true;
  }, [probeNormal]);

  return (
    <div
      style={{
        border: "1px solid #e1e1e6",
        borderRadius: 12,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        boxShadow: "0 0 0 1px #e1e1e6",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700 }}>Gauss map (S²)</div>
      <div style={{ fontSize: 11, color: "#555" }}>
        {points.length
          ? `${points.length} sampled normals plotted`
          : "Enable Gauss map to analyze normals."}
      </div>
      <div ref={mountRef} style={{ width: "100%", height, borderRadius: 10, overflow: "hidden" }} />
    </div>
  );
};

export default GaussMapPanel;
