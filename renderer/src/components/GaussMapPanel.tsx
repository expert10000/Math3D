import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { scalarToColor01, type ColorPalette } from "./colorPalette";
import type { GaussColorMode } from "./gaussMapUtils";
import type { GaussCapSelection, SelectionMask } from "../math/selection/selectionModel";
import type { SurfaceSample } from "../math/sampling/surfaceSampling";
import { computeGaussDensityGrid } from "../math/selection/gaussDensity";
import { installWebGLContextLogger, isNoWebGLMode, vmSafePixelRatio, vmSafeRendererParams } from "./graphicsMode";
import { NoWebGLPanel } from "./NoWebGLPanel";

type GaussMapPanelProps = {
  samples: SurfaceSample[];
  palette: ColorPalette;
  colorMode: GaussColorMode;
  probeNormal?: { x: number; y: number; z: number } | null;
  inspectDir?: { x: number; y: number; z: number } | null;
  onPointHover?: (index: number | null) => void;
  width?: number;
  height?: number;
  selectionMask?: SelectionMask | null;
  onGaussSelection?: (selection: GaussCapSelection) => void;
  densityNormals?: Float32Array | null;
  densitySelectionIndices?: number[] | null;
};

type GaussSampleEntry = {
  sampleIndex: number;
  normal: THREE.Vector3;
  color: { r: number; g: number; b: number };
};

const POINT_SIZE = 0.04;
const SPHERE_SEGMENTS = 56;
const INITIAL_CAMERA_POSITION = new THREE.Vector3(2, 1.5, 3);
const INITIAL_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
const SLIDER_POINT_SIZE = { min: 1, max: 6, step: 0.5 };
const SAMPLE_OPTIONS = [1, 2, 3, 5] as const;
const GAUSS_CAP_RANGE = { min: 5, max: 45, step: 1 };
const DENSITY_CANVAS_SIZE = { width: 220, height: 110 };
const DENSITY_MAX_SAMPLES = 20000;
const DENSITY_RES_OPTIONS = [
  { id: "low", label: "Low (32x16)", nPhi: 32, nTheta: 16 },
  { id: "med", label: "Med (64x32)", nPhi: 64, nTheta: 32 },
  { id: "high", label: "High (128x64)", nPhi: 128, nTheta: 64 },
] as const;
type DensityResId = (typeof DENSITY_RES_OPTIONS)[number]["id"];

const buildSampledEntries = (
  samples: SurfaceSample[],
  palette: ColorPalette,
  colorMode: GaussColorMode,
  samplingStep: number
): GaussSampleEntry[] => {
  if (!samples.length) return [];
  const step = Math.max(1, Math.floor(samplingStep));
  const entries: GaussSampleEntry[] = [];

  for (let i = 0; i < samples.length; i += step) {
    const normal = samples[i].normal.clone().normalize();
    if (!Number.isFinite(normal.x) || !Number.isFinite(normal.y) || !Number.isFinite(normal.z)) {
      continue;
    }
    const { x: nx, y: ny, z: nz } = normal;
    const color =
      colorMode === "components"
        ? { r: 0.5 * (nx + 1), g: 0.5 * (ny + 1), b: 0.5 * (nz + 1) }
        : scalarToColor01((nz + 1) * 0.5, palette);
    entries.push({ sampleIndex: i, normal, color });
  }

  return entries;
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

const selectionRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
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

const densityRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const resetButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #cfd5e3",
  background: "#f6f7fb",
  fontSize: 11,
  cursor: "pointer",
};

const GaussMapPanel: React.FC<GaussMapPanelProps> = (props) => {
  if (isNoWebGLMode()) {
    return <NoWebGLPanel title="Gauss map viewer paused" />;
  }

  const {
  samples,
  palette,
  colorMode,
  probeNormal,
  inspectDir,
  onPointHover,
  width = 280,
  height = 280,
  selectionMask = null,
  onGaussSelection,
  densityNormals = null,
  densitySelectionIndices = null,
  } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const selectedPointsRef = useRef<THREE.Points | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const sphereMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const equatorRef = useRef<THREE.Line | null>(null);
  const hoverRef = useRef<THREE.Mesh | null>(null);
  const probeRef = useRef<THREE.Mesh | null>(null);
  const inspectRef = useRef<THREE.Mesh | null>(null);
  const pointsIndexMapRef = useRef<number[]>([]);
  const entriesRef = useRef<GaussSampleEntry[]>([]);
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const initialSizeRef = useRef({ width, height });
  const densityCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [occludeBack, setOccludeBack] = useState(true);
  const [wireframeSphere, setWireframeSphere] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showEquator, setShowEquator] = useState(false);
  const [pointSize, setPointSize] = useState(2);
  const [samplingStep, setSamplingStep] = useState(1);
  const [selectFromGauss, setSelectFromGauss] = useState(false);
  const [gaussCapAngleDeg, setGaussCapAngleDeg] = useState(15);
  const [showDensity, setShowDensity] = useState(false);
  const [densitySource, setDensitySource] = useState<"selected" | "all">("selected");
  const [densityResId, setDensityResId] = useState<DensityResId>("med");

  const pointSizeRef = useRef(pointSize);
  const occludeBackRef = useRef(occludeBack);
  const onPointHoverRef = useRef(onPointHover);
  const selectFromGaussRef = useRef(selectFromGauss);
  const gaussCapAngleRef = useRef(gaussCapAngleDeg);
  const onGaussSelectionRef = useRef(onGaussSelection);

  useEffect(() => {
    onPointHoverRef.current = onPointHover;
  }, [onPointHover]);

  useEffect(() => {
    onGaussSelectionRef.current = onGaussSelection;
  }, [onGaussSelection]);

  useEffect(() => {
    pointSizeRef.current = pointSize;
  }, [pointSize]);

  useEffect(() => {
    occludeBackRef.current = occludeBack;
  }, [occludeBack]);

  useEffect(() => {
    selectFromGaussRef.current = selectFromGauss;
  }, [selectFromGauss]);

  useEffect(() => {
    gaussCapAngleRef.current = gaussCapAngleDeg;
  }, [gaussCapAngleDeg]);

  const densityGrid = useMemo(() => {
    if (!showDensity || !densityNormals || densityNormals.length === 0) return null;
    const res = DENSITY_RES_OPTIONS.find((option) => option.id === densityResId) ?? DENSITY_RES_OPTIONS[1];
    const indices =
      densitySource === "selected"
        ? densitySelectionIndices?.length
          ? densitySelectionIndices
          : []
        : undefined;
    if (densitySource === "selected" && !indices?.length) {
      return {
        nTheta: res.nTheta,
        nPhi: res.nPhi,
        values: new Float32Array(res.nTheta * res.nPhi),
        maxCount: 0,
        total: 0,
      };
    }
    return computeGaussDensityGrid(densityNormals, {
      nTheta: res.nTheta,
      nPhi: res.nPhi,
      smooth: true,
      indices,
      maxSamples: DENSITY_MAX_SAMPLES,
    });
  }, [showDensity, densityNormals, densitySelectionIndices, densitySource, densityResId]);

  useEffect(() => {
    const canvas = densityCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!densityGrid) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const { nPhi, nTheta, values } = densityGrid;
    if (canvas.width !== nPhi) canvas.width = nPhi;
    if (canvas.height !== nTheta) canvas.height = nTheta;

    const image = ctx.createImageData(nPhi, nTheta);
    for (let t = 0; t < nTheta; t++) {
      for (let p = 0; p < nPhi; p++) {
        const idx = t * nPhi + p;
        const val = values[idx];
        const { r, g, b } = scalarToColor01(val, palette);
        const base = idx * 4;
        image.data[base] = Math.round(r * 255);
        image.data[base + 1] = Math.round(g * 255);
        image.data[base + 2] = Math.round(b * 255);
        image.data[base + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [densityGrid, palette]);

  const handleResetView = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.copy(INITIAL_CAMERA_POSITION);
    camera.up.set(0, 1, 0);
    controls.target.copy(INITIAL_CAMERA_TARGET);
    controls.update();
  };

  const handlePointSizeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    console.log("[GaussMapPanel] point size slider moved to", next);
    setPointSize(next);
  }, []);

  const handleSamplingStepChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(event.target.value);
    console.log("[GaussMapPanel] sampling step set to", next);
    setSamplingStep(next);
  }, []);

  const handleCapAngleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    console.log("[GaussMapPanel] Gauss cap angle slider moved to", next);
    setGaussCapAngleDeg(next);
  }, []);

  const handleOccludeToggle = useCallback(() => {
    setOccludeBack((prev) => {
      const next = !prev;
      console.log("[GaussMapPanel] occlude toggled", next ? "enabling" : "disabling");
      return next;
    });
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const { width: w, height: h } = initialSizeRef.current;
    const renderer = new THREE.WebGLRenderer(vmSafeRendererParams({ antialias: true, alpha: true }));
    const removeWebGLContextLogger = installWebGLContextLogger(renderer.domElement, "gauss-map");
    renderer.setPixelRatio(vmSafePixelRatio(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
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
    scene.add(sphere);
    sphereRef.current = sphere;
    sphereMaterialRef.current = sphereMaterial;

    const hoverMesh = createHighlightMesh(0xffff66);
    scene.add(hoverMesh);
    hoverRef.current = hoverMesh;

    const probeMesh = createHighlightMesh(0xff5d73);
    scene.add(probeMesh);
    probeRef.current = probeMesh;

    const inspectMesh = createHighlightMesh(0xffd54f);
    scene.add(inspectMesh);
    inspectRef.current = inspectMesh;

    const axesHelper = new THREE.AxesHelper(1.2);
    axesHelper.visible = showAxes;
    scene.add(axesHelper);
    axesRef.current = axesHelper;

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
    scene.add(equatorLine);
    equatorRef.current = equatorLine;

    const pointer = pointerRef.current;
    const raycaster = raycasterRef.current;
    raycaster.params.Points.threshold = 0.035;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const pts = pointsRef.current;
      if (!pts) {
        setHoverIndex(null);
        onPointHoverRef.current?.(null);
        return;
      }

      const intersects = raycaster.intersectObject(pts);
      if (!intersects.length || typeof intersects[0].index !== "number") {
        setHoverIndex(null);
        onPointHoverRef.current?.(null);
        return;
      }

      const idx = intersects[0].index;
      const sampleIndex = pointsIndexMapRef.current[idx];
      if (typeof sampleIndex !== "number") {
        setHoverIndex(null);
        onPointHoverRef.current?.(null);
        return;
      }

      setHoverIndex(sampleIndex);
      onPointHoverRef.current?.(sampleIndex);
    };

    const handlePointerLeave = () => {
      setHoverIndex(null);
      onPointHoverRef.current?.(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!selectFromGaussRef.current || !onGaussSelectionRef.current || !sphereRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(sphereRef.current, false);
      if (!intersects.length) return;
      const capNormal = intersects[0].point.clone().normalize();
      console.log("[GaussMapPanel] gauss sphere click", {
        angleDeg: gaussCapAngleRef.current,
        normal: capNormal.toArray(),
      });
      onGaussSelectionRef.current({
        kind: "gaussCap",
        capNormal,
        angleRad: THREE.MathUtils.degToRad(gaussCapAngleRef.current),
      });
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const rect = mount.getBoundingClientRect();
      const w = rect.width || initialSizeRef.current.width;
      const h = rect.height || initialSizeRef.current.height;
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
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      controls.dispose();

      if (sphereRef.current) {
        scene.remove(sphereRef.current);
        sphereRef.current.geometry.dispose();
      }
      sphereMaterialRef.current?.dispose();
      if (hoverRef.current) {
        scene.remove(hoverRef.current);
        hoverRef.current.geometry.dispose();
        (hoverRef.current.material as THREE.Material).dispose();
      }
      if (probeRef.current) {
        scene.remove(probeRef.current);
        probeRef.current.geometry.dispose();
        (probeRef.current.material as THREE.Material).dispose();
      }
      if (inspectRef.current) {
        scene.remove(inspectRef.current);
        inspectRef.current.geometry.dispose();
        (inspectRef.current.material as THREE.Material).dispose();
      }
      if (axesRef.current) {
        scene.remove(axesRef.current);
        axesRef.current.geometry.dispose();
        (axesRef.current.material as THREE.Material).dispose();
      }
      if (equatorRef.current) {
        scene.remove(equatorRef.current);
        equatorRef.current.geometry.dispose();
        (equatorRef.current.material as THREE.Material).dispose();
      }
      if (pointsRef.current) {
        scene.remove(pointsRef.current);
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
      }
      if (selectedPointsRef.current) {
        scene.remove(selectedPointsRef.current);
        selectedPointsRef.current.geometry.dispose();
        (selectedPointsRef.current.material as THREE.Material).dispose();
      }

      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      removeWebGLContextLogger();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
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
      pointsIndexMapRef.current = [];
      entriesRef.current = [];
    }

    if (!samples.length) return;

    const entries = buildSampledEntries(samples, palette, colorMode, samplingStep);
    if (!entries.length) return;

    const positions = new Float32Array(entries.length * 3);
    const colors = new Float32Array(entries.length * 3);
    entries.forEach((entry, idx) => {
      positions[3 * idx] = entry.normal.x;
      positions[3 * idx + 1] = entry.normal.y;
      positions[3 * idx + 2] = entry.normal.z;
      colors[3 * idx] = entry.color.r;
      colors[3 * idx + 1] = entry.color.g;
      colors[3 * idx + 2] = entry.color.b;
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: pointSizeRef.current,
      vertexColors: true,
      sizeAttenuation: false,
      depthTest: occludeBack,
      depthWrite: occludeBack,
    });

    const pts = new THREE.Points(geom, mat);
    pts.renderOrder = 5;
    scene.add(pts);
    pointsRef.current = pts;
    pointsIndexMapRef.current = entries.map((entry) => entry.sampleIndex);
    entriesRef.current = entries;
  }, [samples, palette, colorMode, samplingStep, occludeBack]);

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
    const scene = sceneRef.current;
    if (!scene) return;

    if (selectedPointsRef.current) {
      scene.remove(selectedPointsRef.current);
      selectedPointsRef.current.geometry.dispose();
      (selectedPointsRef.current.material as THREE.Material).dispose();
      selectedPointsRef.current = null;
    }

    if (!selectionMask?.count || !entriesRef.current.length) {
      return;
    }

    const posValues: number[] = [];
    entriesRef.current.forEach((entry) => {
      if (!selectionMask.selected[entry.sampleIndex]) return;
      posValues.push(entry.normal.x, entry.normal.y, entry.normal.z);
    });

    if (!posValues.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posValues), 3));

    const mat = new THREE.PointsMaterial({
      color: 0x8b0000,
      size: pointSizeRef.current + 2.5,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
    });

    const pts = new THREE.Points(geometry, mat);
    pts.renderOrder = 15;
    scene.add(pts);
    selectedPointsRef.current = pts;
  }, [selectionMask, samplingStep, occludeBack, samples]);

  useEffect(() => {
    const hover = hoverRef.current;
    if (!hover) return;
    if (hoverIndex == null || hoverIndex < 0 || hoverIndex >= samples.length) {
      hover.visible = false;
      return;
    }
    const normal = samples[hoverIndex].normal;
    const len = normal.length();
    hover.position.set(
      len > 0 ? normal.x / len : 0,
      len > 0 ? normal.y / len : 0,
      len > 0 ? normal.z / len : 0
    );
    hover.visible = true;
  }, [hoverIndex, samples]);

  useEffect(() => {
    setHoverIndex(null);
    onPointHover?.(null);
  }, [samples, onPointHover]);

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

  useEffect(() => {
    const inspect = inspectRef.current;
    if (!inspect) return;
    if (!inspectDir) {
      inspect.visible = false;
      return;
    }
    const len = Math.hypot(inspectDir.x, inspectDir.y, inspectDir.z);
    inspect.position.set(
      len > 0 ? inspectDir.x / len : 0,
      len > 0 ? inspectDir.y / len : 0,
      len > 0 ? inspectDir.z / len : 0
    );
    inspect.visible = true;
  }, [inspectDir]);

  const selectionInfo = selectionMask?.count ? ` · ${selectionMask.count} selected` : "";

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
        {samples.length
          ? `${samples.length} sampled normals plotted${selectionInfo}`
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
            onChange={handleOccludeToggle}
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
            onChange={handlePointSizeChange}
            style={{ width: 120 }}
          />
        </div>
        <div style={samplingContainerStyle}>
          <span style={{ fontSize: 10, color: "#555" }}>Sample every {samplingStep}</span>
          <select
            value={samplingStep}
            onChange={handleSamplingStepChange}
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
      <div style={selectionRowStyle}>
        <label style={toggleLabelStyle} title="Click sphere caps to select normals">
          <input
            type="checkbox"
            checked={selectFromGauss}
            onChange={(event) => setSelectFromGauss(event.target.checked)}
            style={toggleInputStyle}
          />
          Select from Gauss
        </label>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 10, color: "#555" }}>Cap angle {gaussCapAngleDeg}°</div>
          <input
            type="range"
            min={GAUSS_CAP_RANGE.min}
            max={GAUSS_CAP_RANGE.max}
            step={GAUSS_CAP_RANGE.step}
            value={gaussCapAngleDeg}
            onChange={handleCapAngleChange}
            style={{ width: 160 }}
          />
        </div>
      </div>
      <div style={densityRowStyle}>
        <label style={toggleLabelStyle} title="Show density of normals on the sphere">
          <input
            type="checkbox"
            checked={showDensity}
            onChange={(event) => setShowDensity(event.target.checked)}
            style={toggleInputStyle}
          />
          Density
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ color: "#555" }}>Source</span>
          <select
            value={densitySource}
            onChange={(event) => setDensitySource(event.target.value as "selected" | "all")}
            style={{ fontSize: 11, padding: "2px 4px" }}
            disabled={!showDensity}
          >
            <option value="selected">Selected</option>
            <option value="all">All points</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ color: "#555" }}>Res</span>
          <select
            value={densityResId}
            onChange={(event) => setDensityResId(event.target.value as DensityResId)}
            style={{ fontSize: 11, padding: "2px 4px" }}
            disabled={!showDensity}
          >
            {DENSITY_RES_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {showDensity && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              fontSize: 10,
              color: "#555",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            theta 0..pi
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <canvas
              ref={densityCanvasRef}
              width={DENSITY_CANVAS_SIZE.width}
              height={DENSITY_CANVAS_SIZE.height}
              style={{
                width: DENSITY_CANVAS_SIZE.width,
                height: DENSITY_CANVAS_SIZE.height,
                borderRadius: 6,
                border: "1px solid #e1e1e6",
                background: "#f3f4f8",
              }}
            />
            <div style={{ fontSize: 10, color: "#555" }}>phi 0..2pi</div>
          </div>
        </div>
      )}
      <div ref={mountRef} style={{ width: "100%", height, borderRadius: 10, overflow: "hidden" }} />
    </div>
  );
};

export default GaussMapPanel;
