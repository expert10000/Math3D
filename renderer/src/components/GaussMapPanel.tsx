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
const INITIAL_CAMERA_POSITION = new THREE.Vector3(2, 1.5, 3);
const INITIAL_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

const SLIDER_POINT_SIZE = { min: 1, max: 6, step: 0.5 };
const SAMPLE_OPTIONS = [1, 2, 3, 5] as const;

const buildPointGeometry = (extras: Float32Array, colors: Float32Array) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(extras, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
};

const buildSampledPointData = (
  data: GaussPoint[],
  palette: ColorPalette,
  colorMode: GaussColorMode,
  samplingStep: number
) => {
  const step = Math.max(1, Math.floor(samplingStep));
  const selectedIndices: number[] = [];
  for (let i = 0; i < data.length; i += step) {
    selectedIndices.push(i);
  }

  const positions = new Float32Array(selectedIndices.length * 3);
  const colors = new Float32Array(selectedIndices.length * 3);

  selectedIndices.forEach((sourceIndex, sampleIndex) => {
    const normal = data[sourceIndex].normal;
    const len = Math.hypot(normal.x, normal.y, normal.z);
    const nx = len > 0 ? normal.x / len : 0;
    const ny = len > 0 ? normal.y / len : 0;
    const nz = len > 0 ? normal.z / len : 0;

    positions[3 * sampleIndex] = nx;
    positions[3 * sampleIndex + 1] = ny;
    positions[3 * sampleIndex + 2] = nz;

    const color =
      colorMode === "components"
        ? {
            r: 0.5 * (nx + 1),
            g: 0.5 * (ny + 1),
            b: 0.5 * (nz + 1),
          }
        : scalarToColor01((nz + 1) * 0.5, palette);

    colors[3 * sampleIndex] = color.r;
    colors[3 * sampleIndex + 1] = color.g;
    colors[3 * sampleIndex + 2] = color.b;
  });

  return { positions, colors, indexMap: selectedIndices };
};

const createHighlightMesh = (color: number) => {
  const geom = new THREE.SphereGeometry(POINT_SIZE, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 10;
  mesh.visible = false;
  return mesh;
};

const controlRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
  marginTop: 4,
  fontSize: 11,
};

const toggleLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  cursor: "pointer",
  userSelect: "none",
};

const toggleInputStyle: React.CSSProperties = {
  width: 14,
  height: 14,
};

const sliderContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 120,
};

const samplingContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 110,
};

const resetButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #cfd5e3",
  background: "#f6f7fb",
  fontSize: 11,
  cursor: "pointer",
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
  const controlsRef = useRef<OrbitControls | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const sphereMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const equatorRef = useRef<THREE.Line | null>(null);
  const pointsIndexMapRef = useRef<number[] | null>(null);
  const pointsDataRef = useRef<GaussPoint[]>(points);
  const onPointHoverRef = useRef(onPointHover);
  const initialSizeRef = useRef({ width, height });

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [occludeBack, setOccludeBack] = useState(true);
  const [wireframeSphere, setWireframeSphere] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showEquator, setShowEquator] = useState(false);
  const [pointSize, setPointSize] = useState(2);
  const [samplingStep, setSamplingStep] = useState(1);

  const pointSizeRef = useRef(pointSize);
  const occludeBackRef = useRef(occludeBack);

  useEffect(() => {
    pointsDataRef.current = points;
  }, [points]);

  useEffect(() => {
    onPointHoverRef.current = onPointHover;
  }, [onPointHover]);

  useEffect(() => {
    pointSizeRef.current = pointSize;
  }, [pointSize]);

  useEffect(() => {
    occludeBackRef.current = occludeBack;
  }, [occludeBack]);

  const handleResetView = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.copy(INITIAL_CAMERA_POSITION);
    camera.up.set(0, 1, 0);
    controls.target.copy(INITIAL_CAMERA_TARGET);
    controls.update();
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const initialSize = initialSizeRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(initialSize.width, initialSize.height);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, initialSize.width / initialSize.height, 0.1, 100);
    camera.position.copy(INITIAL_CAMERA_POSITION);
    camera.up.set(0, 1, 0);
    camera.lookAt(INITIAL_CAMERA_TARGET);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 1.5;
    controls.maxDistance = 6.0;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.target.copy(INITIAL_CAMERA_TARGET);
    controls.update();
    controlsRef.current = controls;

    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x8797bd,
      transparent: true,
      opacity: wireframeSphere ? 0.35 : 0.12,
      depthWrite: occludeBackRef.current,
      depthTest: occludeBackRef.current,
      wireframe: wireframeSphere,
    });
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
      sphereMaterial
    );
    sphereRef.current = sphere;
    sphereMaterialRef.current = sphereMaterial;
    scene.add(sphere);

    const hoverMesh = createHighlightMesh(0xffff66);
    hoverRef.current = hoverMesh;
    scene.add(hoverMesh);

    const probeMesh = createHighlightMesh(0xff5d73);
    probeRef.current = probeMesh;
    scene.add(probeMesh);

    const axesHelper = new THREE.AxesHelper(1.2);
    axesHelper.visible = showAxes;
    axesRef.current = axesHelper;
    scene.add(axesHelper);

    const circlePoints: THREE.Vector3[] = [];
    const circleSegments = 64;
    for (let i = 0; i <= circleSegments; i++) {
      const angle = (i / circleSegments) * Math.PI * 2;
      circlePoints.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
    }
    const equatorGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
    const equatorLine = new THREE.Line(
      equatorGeometry,
      new THREE.LineBasicMaterial({ color: 0x4c5674, transparent: true, opacity: 0.5 })
    );
    equatorLine.visible = showEquator;
    equatorRef.current = equatorLine;
    scene.add(equatorLine);

    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.035;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const pointsMesh = pointsRef.current;
      const availablePoints = pointsDataRef.current;
      if (!pointsMesh || !availablePoints.length) {
        setHoverIndex(null);
        onPointHoverRef.current?.(null);
        return;
      }

      const intersects = raycaster.intersectObject(pointsMesh);
      if (!intersects.length || typeof intersects[0].index !== "number") {
        setHoverIndex(null);
        onPointHoverRef.current?.(null);
        return;
      }

      const rawIndex = intersects[0].index;
      const mappedIndex =
        typeof rawIndex === "number" ? pointsIndexMapRef.current?.[rawIndex] ?? rawIndex : null;
      if (mappedIndex == null) {
        setHoverIndex(null);
        onPointHoverRef.current?.(null);
        return;
      }

      setHoverIndex(mappedIndex);
      onPointHoverRef.current?.(mappedIndex);
    };

    const handlePointerLeave = () => {
      setHoverIndex(null);
      onPointHoverRef.current?.(null);
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
      const w = rect.width || initialSize.width;
      const h = rect.height || initialSize.height;
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
      controlsRef.current = null;
      if (sphereRef.current) {
        scene.remove(sphereRef.current);
        sphereRef.current.geometry.dispose();
      }
      sphereMaterialRef.current?.dispose();
      sphereRef.current = null;
      sphereMaterialRef.current = null;
      scene.remove(hoverMesh);
      hoverMesh.geometry.dispose();
      (hoverMesh.material as THREE.Material).dispose();
      scene.remove(probeMesh);
      probeMesh.geometry.dispose();
      (probeMesh.material as THREE.Material).dispose();
      if (axesHelper) {
        scene.remove(axesHelper);
        axesHelper.geometry.dispose();
        (axesHelper.material as THREE.Material).dispose();
      }
      if (equatorLine) {
        scene.remove(equatorLine);
        equatorLine.geometry.dispose();
        (equatorLine.material as THREE.Material).dispose();
      }
      pointsIndexMapRef.current = null;
      if (pointsRef.current) {
        scene.remove(pointsRef.current);
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
        pointsRef.current = null;
      }
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) return;

    if (pointsRef.current) {
      scene.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      (pointsRef.current.material as THREE.Material).dispose();
      pointsRef.current = null;
      pointsIndexMapRef.current = null;
    }

    if (!points.length) {
      return;
    }

    const { positions, colors, indexMap } = buildSampledPointData(points, palette, colorMode, samplingStep);
    const geom = buildPointGeometry(positions, colors);
    const mat = new THREE.PointsMaterial({
      size: pointSizeRef.current,
      vertexColors: true,
      sizeAttenuation: false,
      depthTest: occludeBackRef.current,
      depthWrite: occludeBackRef.current,
    });

    const pts = new THREE.Points(geom, mat);
    pts.renderOrder = 5;
    scene.add(pts);
    pointsRef.current = pts;
    pointsIndexMapRef.current = indexMap;
  }, [points, palette, colorMode, samplingStep]);

  useEffect(() => {
    const pts = pointsRef.current;
    if (!pts) return;
    const mat = pts.material as THREE.PointsMaterial;
    mat.size = pointSize;
    mat.depthTest = occludeBack;
    mat.depthWrite = occludeBack;
  }, [pointSize, occludeBack]);

  useEffect(() => {
    const mat = sphereMaterialRef.current;
    if (!mat) return;
    mat.depthWrite = occludeBack;
    mat.depthTest = occludeBack;
    mat.wireframe = wireframeSphere;
    mat.opacity = wireframeSphere ? 0.35 : 0.12;
    mat.transparent = true;
  }, [occludeBack, wireframeSphere]);

  useEffect(() => {
    const axes = axesRef.current;
    if (axes) {
      axes.visible = showAxes;
    }
  }, [showAxes]);

  useEffect(() => {
    const equator = equatorRef.current;
    if (equator) {
      equator.visible = showEquator;
    }
  }, [showEquator]);

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
      <div style={{ fontSize: 12, fontWeight: 700 }}>Gauss map (Sı)</div>
      <div style={{ fontSize: 11, color: "#555" }}>
        {points.length
          ? `${points.length} sampled normals plotted`
          : "Enable Gauss map to analyze normals."}
      </div>
      <div style={controlRowStyle}>
        <button type="button" onClick={handleResetView} style={resetButtonStyle}>
          Reset
        </button>
        <label style={toggleLabelStyle} title="Occlude back-facing normals">
          <input
            type="checkbox"
            checked={occludeBack}
            onChange={() => setOccludeBack((prev) => !prev)}
            style={toggleInputStyle}
          />
          Occlude
        </label>
        <label style={toggleLabelStyle} title="Toggle sphere wireframe">
          <input
            type="checkbox"
            checked={wireframeSphere}
            onChange={() => setWireframeSphere((prev) => !prev)}
            style={toggleInputStyle}
          />
          Wireframe
        </label>
        <label style={toggleLabelStyle} title="Show global axes">
          <input
            type="checkbox"
            checked={showAxes}
            onChange={() => setShowAxes((prev) => !prev)}
            style={toggleInputStyle}
          />
          Axes
        </label>
        <label style={toggleLabelStyle} title="Draw equator circle">
          <input
            type="checkbox"
            checked={showEquator}
            onChange={() => setShowEquator((prev) => !prev)}
            style={toggleInputStyle}
          />
          Equator
        </label>
        <div style={sliderContainerStyle}>
          <span style={{ fontSize: 10, color: "#555" }}>Size {pointSize.toFixed(1)}px</span>
          <input
            type="range"
            min={SLIDER_POINT_SIZE.min}
            max={SLIDER_POINT_SIZE.max}
            step={SLIDER_POINT_SIZE.step}
            value={pointSize}
            onChange={(event) => setPointSize(Number(event.target.value))}
            style={{ width: 120 }}
          />
        </div>
        <div style={samplingContainerStyle}>
          <span style={{ fontSize: 10, color: "#555" }}>Sample every {samplingStep}</span>
          <select
            value={samplingStep}
            onChange={(event) => setSamplingStep(Number(event.target.value))}
            style={{ fontSize: 11, padding: "2px 4px" }}
          >
            {SAMPLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div ref={mountRef} style={{ width: "100%", height, borderRadius: 10, overflow: "hidden" }} />
    </div>
  );
};

export default GaussMapPanel;
