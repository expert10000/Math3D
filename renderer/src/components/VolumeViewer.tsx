import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { marchingCubesVolume } from "../math/marchingCubes";

import type { VolumeDataset, VectorGrid } from "../scene/datasets";
import type { Image2D } from "../scene/renderPrimitives";
import {
  buildSliceImage,
  gradientMagnitudeAt,
  sampleGridTrilinear,
  sliceVolumeData,
  volumeSliceContours,
  type SliceAxis,
  type VolumeSliceData,
  type VolumeSliceHover,
  type VolumeSliceReport,
  type VolumeSliceWindow,
} from "../scene/volume/sliceVolume";
import {
  supportsVtkVolumeSlice,
  vtkVolumeIsosurface,
  vtkVolumeSlice,
  vtkVolumeStreamlines,
} from "../services/vtkVolumeClient";
import { vtkSmooth } from "../services/vtkMeshClient";
import {
  installWebGLContextLogger,
  isNoWebGLMode,
  isVmSafeGraphicsMode,
  vmSafePixelRatio,
  vmSafeRendererParams,
} from "./graphicsMode";
import { NoWebGLPanel } from "./NoWebGLPanel";
import {
  clearGroupResources,
  disposeMaterialOrMaterials,
  disposeObject3DResources,
  disposeRendererResources,
} from "./threeDisposal";
import { registerThreeResourceDiagnostics } from "./threeResourceDiagnostics";

export type VolumeViewerProps = {
  dataset: VolumeDataset | null;
  vectorGrid?: VectorGrid | null;
  axis: SliceAxis;
  index: number;
  opacity: number;
  crosshair?: [number, number, number] | null;
  onSlicePick?: (world: [number, number, number]) => void;
  viewPreset?: "free" | "xy" | "xz" | "yz";
  showAxes?: boolean;
  contourEnabled?: boolean;
  contourCount?: number;
  windowMode?: "auto" | "minmax";
  onSliceReport?: (report: VolumeSliceReport | null) => void;
  onSliceHover?: (hover: VolumeSliceHover | null) => void;
  showIsosurface?: boolean;
  isoValue?: number;
  isoSmoothing?: boolean;
  isoSmoothingIterations?: number;
  showCropBox?: boolean;
  cropCenter?: [number, number, number];
  cropExtents?: [number, number, number];
  cropGizmoEnabled?: boolean;
  cropGizmoMode?: "move" | "scale";
  onCropChange?: (center: [number, number, number], extents: [number, number, number]) => void;
  showStreamlines?: boolean;
  streamlineSeeds?: [number, number, number][];
  streamlineStepSize?: number;
  streamlineMaxSteps?: number;
  streamlineMaxLength?: number;
  captureToken?: number;
  onCaptureThumbnail?: (dataUrl: string | null) => void;
};

const IDLE_RENDER_MIN_FRAME_MS = 1000 / 2;
const VM_SAFE_IDLE_RENDER_MIN_FRAME_MS = 5000;
const VM_SAFE_HOVER_MIN_FRAME_MS = 250;

const disposeMesh = (mesh: THREE.Mesh) => {
  mesh.geometry.dispose();
  disposeMaterialOrMaterials(mesh.material as THREE.Material | THREE.Material[]);
};

const clearGroup = (group: THREE.Group) => {
  clearGroupResources(group);
};

const VTK_SLICE_THRESHOLD = 64 * 64 * 64;
const VTK_ISO_THRESHOLD = 64 * 64 * 64;

const buildCpuIsosurface = (
  grid: VolumeDataset["grid"],
  iso: number
): THREE.BufferGeometry | null => {
  const [nx, ny, nz] = grid.dims;
  const total = nx * ny * nz;
  if (!total || total > VTK_ISO_THRESHOLD) return null;

  const res = marchingCubesVolume(grid, iso);
  if (!res) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(res.positions, 3));
  geom.setIndex(new THREE.BufferAttribute(res.indices, 1));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  geom.computeBoundingBox();
  return geom;
};

const getGridBounds = (grid: VolumeDataset["grid"]) => {
  const spacing = grid.spacing ?? [1, 1, 1];
  const origin = grid.origin ?? [0, 0, 0];
  const max: [number, number, number] = [
    origin[0] + spacing[0] * Math.max(0, grid.dims[0] - 1),
    origin[1] + spacing[1] * Math.max(0, grid.dims[1] - 1),
    origin[2] + spacing[2] * Math.max(0, grid.dims[2] - 1),
  ];
  const min: [number, number, number] = [origin[0], origin[1], origin[2]];
  const center: [number, number, number] = [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
  ];
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];
  const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return { min, max, center, diag };
};

const findNearestPointOnMesh = (geom: THREE.BufferGeometry, point: THREE.Vector3) => {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | null;
  if (!pos) return null;
  const index = geom.getIndex();
  const posArr = pos.array as ArrayLike<number>;
  const idxArr = index?.array as ArrayLike<number> | undefined;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tri = new THREE.Triangle();
  const closest = new THREE.Vector3();
  const best = new THREE.Vector3();
  let bestDist = Infinity;

  if (idxArr && idxArr.length >= 3) {
    const triCount = Math.floor(idxArr.length / 3);
    for (let i = 0; i < triCount; i++) {
      const ia = Number(idxArr[i * 3]) * 3;
      const ib = Number(idxArr[i * 3 + 1]) * 3;
      const ic = Number(idxArr[i * 3 + 2]) * 3;
      a.set(posArr[ia], posArr[ia + 1], posArr[ia + 2]);
      b.set(posArr[ib], posArr[ib + 1], posArr[ib + 2]);
      c.set(posArr[ic], posArr[ic + 1], posArr[ic + 2]);
      tri.set(a, b, c);
      tri.closestPointToPoint(point, closest);
      const dist = closest.distanceToSquared(point);
      if (dist < bestDist) {
        bestDist = dist;
        best.copy(closest);
      }
    }
  } else {
    const triCount = Math.floor(posArr.length / 9);
    for (let i = 0; i < triCount; i++) {
      const base = i * 9;
      a.set(posArr[base], posArr[base + 1], posArr[base + 2]);
      b.set(posArr[base + 3], posArr[base + 4], posArr[base + 5]);
      c.set(posArr[base + 6], posArr[base + 7], posArr[base + 8]);
      tri.set(a, b, c);
      tri.closestPointToPoint(point, closest);
      const dist = closest.distanceToSquared(point);
      if (dist < bestDist) {
        bestDist = dist;
        best.copy(closest);
      }
    }
  }

  if (!Number.isFinite(bestDist)) return null;
  return best;
};

export const VolumeViewer: React.FC<VolumeViewerProps> = (props) => {
  if (isNoWebGLMode()) {
    return <NoWebGLPanel title="3D volume viewer paused" />;
  }

  const {
  dataset,
  vectorGrid,
  axis,
  index,
  opacity,
  crosshair = null,
  onSlicePick,
  viewPreset = "free",
  showAxes = true,
  contourEnabled = false,
  contourCount = 6,
  windowMode = "auto",
  onSliceReport,
  onSliceHover,
  showIsosurface = false,
  isoValue = 0,
  isoSmoothing = false,
  isoSmoothingIterations = 20,
  showCropBox = false,
  cropCenter,
  cropExtents,
  cropGizmoEnabled = false,
  cropGizmoMode = "move",
  onCropChange,
  showStreamlines = false,
  streamlineSeeds,
  streamlineStepSize,
  streamlineMaxSteps,
  streamlineMaxLength,
  captureToken = 0,
  onCaptureThumbnail,
  } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const sliceMeshRef = useRef<THREE.Mesh | null>(null);
  const sliceTextureRef = useRef<THREE.DataTexture | null>(null);
  const contourGroupRef = useRef<THREE.Group | null>(null);
  const hoverMarkerRef = useRef<THREE.Mesh | null>(null);
  const isoMeshRef = useRef<THREE.Mesh | null>(null);
  const isoMarkerRef = useRef<THREE.Mesh | null>(null);
  const streamlinesGroupRef = useRef<THREE.Group | null>(null);
  const cropBoxRef = useRef<THREE.LineSegments | null>(null);
  const cropGizmoRef = useRef<TransformControls | null>(null);
  const cropGizmoHelperRef = useRef<THREE.Object3D | null>(null);
  const cropDraggingRef = useRef(false);
  const crosshairGroupRef = useRef<THREE.Group | null>(null);
  const opacityRef = useRef(opacity);
  const [sliceData, setSliceData] = useState<VolumeSliceData | null>(null);
  const [sliceImage, setSliceImage] = useState<Image2D | null>(null);
  const sliceDataRef = useRef<VolumeSliceData | null>(null);
  const datasetRef = useRef<VolumeDataset | null>(dataset);
  const [hoverInfo, setHoverInfo] = useState<VolumeSliceHover | null>(null);
  const hoverInfoRef = useRef<VolumeSliceHover | null>(null);
  const onCropChangeRef = useRef(onCropChange);
  const onSlicePickRef = useRef(onSlicePick);
  const hoverPendingRef = useRef<{ x: number; y: number } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const [isoMeshToken, setIsoMeshToken] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    datasetRef.current = dataset;
  }, [dataset]);

  useEffect(() => {
    sliceDataRef.current = sliceData;
  }, [sliceData]);

  useEffect(() => {
    hoverInfoRef.current = hoverInfo;
    if (onSliceHover) onSliceHover(hoverInfo);
  }, [hoverInfo, onSliceHover]);

  useEffect(() => {
    onCropChangeRef.current = onCropChange;
  }, [onCropChange]);

  useEffect(() => {
    if (!onCaptureThumbnail || !captureToken) return;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!renderer || !scene || !cam) {
      onCaptureThumbnail(null);
      return;
    }
    renderer.render(scene, cam);
    const src = renderer.domElement;
    const w = 240;
    const h = 160;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onCaptureThumbnail(null);
      return;
    }
    ctx.drawImage(src, 0, 0, w, h);
    onCaptureThumbnail(canvas.toDataURL("image/jpeg", 0.7));
  }, [captureToken]);

  useEffect(() => {
    onSlicePickRef.current = onSlicePick;
  }, [onSlicePick]);

  useEffect(() => {
    if (axesHelperRef.current) {
      axesHelperRef.current.visible = showAxes;
    }
  }, [showAxes]);

  const sliceWindow = useMemo<VolumeSliceWindow | null>(() => {
    if (!sliceData) return null;
    const stats = sliceData.stats;
    const low = windowMode === "auto" ? stats.p02 : stats.min;
    const high = windowMode === "auto" ? stats.p98 : stats.max;
    return { low, high, mode: windowMode };
  }, [sliceData, windowMode]);

  useEffect(() => {
    if (!cropGizmoRef.current) return;
    cropGizmoRef.current.setMode(cropGizmoMode === "scale" ? "scale" : "translate");
    const enabled = !!cropGizmoEnabled && !!showCropBox;
    cropGizmoRef.current.enabled = enabled;
    if (cropGizmoHelperRef.current) {
      cropGizmoHelperRef.current.visible = enabled;
    }
  }, [cropGizmoMode, cropGizmoEnabled, showCropBox]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!sceneReady || !camera || !controls) return;
    controls.enableRotate = viewPreset === "free";
    controls.enablePan = true;
    controls.enableZoom = true;
    if (viewPreset === "free" || !dataset?.grid) return;

    const bounds = getGridBounds(dataset.grid);
    const center = new THREE.Vector3(...bounds.center);
    const dist = Math.max(1, bounds.diag * 1.4);
    const pos = new THREE.Vector3(...bounds.center);

    if (viewPreset === "xy") {
      pos.set(center.x, center.y, center.z + dist);
      camera.up.set(0, 1, 0);
    } else if (viewPreset === "xz") {
      pos.set(center.x, center.y - dist, center.z);
      camera.up.set(0, 0, 1);
    } else if (viewPreset === "yz") {
      pos.set(center.x + dist, center.y, center.z);
      camera.up.set(0, 0, 1);
    }

    camera.position.copy(pos);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }, [dataset, viewPreset, sceneReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
    camera.position.set(2.6, 2.4, 2.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer(vmSafeRendererParams({ antialias: true, alpha: true }));
    const removeWebGLContextLogger = installWebGLContextLogger(renderer.domElement, "volume");
    renderer.setPixelRatio(vmSafePixelRatio(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);
    const resourceDiagnostics = registerThreeResourceDiagnostics("volume", scene, renderer);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controls.update();

    let lastRenderedAt = 0;
    let controlsInteractionActive = false;
    const renderSoon = () => {
      lastRenderedAt = 0;
    };
    const handleControlsStart = () => {
      controlsInteractionActive = true;
      renderSoon();
    };
    const handleControlsEnd = () => {
      controlsInteractionActive = false;
      renderSoon();
    };
    controls.addEventListener("start", handleControlsStart);
    controls.addEventListener("end", handleControlsEnd);
    controls.addEventListener("change", renderSoon);

    const axes = new THREE.AxesHelper(1.25);
    const axesMat = axes.material as THREE.Material | THREE.Material[];
    if (Array.isArray(axesMat)) {
      axesMat.forEach((m) => {
        m.depthTest = false;
      });
    } else {
      axesMat.depthTest = false;
    }
    axes.renderOrder = 5;
    axes.visible = showAxes;
    scene.add(axes);
    axesHelperRef.current = axes;

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(3.5, 4.2, 3.8);
    scene.add(dir);

    const contourGroup = new THREE.Group();
    contourGroup.renderOrder = 6;
    scene.add(contourGroup);
    contourGroupRef.current = contourGroup;

    const cropGizmo = new TransformControls(camera, renderer.domElement);
    cropGizmo.setMode(cropGizmoMode === "scale" ? "scale" : "translate");
    cropGizmo.setSpace("world");
    cropGizmo.enabled = !!cropGizmoEnabled;
    cropGizmo.setSize(0.9);
    const cropGizmoHelper = cropGizmo.getHelper();
    cropGizmoHelper.visible = !!cropGizmoEnabled;
    cropGizmoHelper.renderOrder = 9;
    cropGizmoHelper.traverse((child: any) => {
      if (!child) return;
      child.renderOrder = 9;
      const mat = child.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      const setMat = (m: THREE.Material) => {
        m.depthTest = false;
        m.depthWrite = false;
        m.transparent = true;
      };
      if (Array.isArray(mat)) mat.forEach(setMat);
      else setMat(mat);
    });
    cropGizmo.addEventListener("dragging-changed", (evt: any) => {
      const dragging = !!evt?.value;
      cropDraggingRef.current = dragging;
      controlsInteractionActive = dragging;
      renderSoon();
      controls.enabled = !dragging;
    });
    cropGizmo.addEventListener("objectChange", () => {
      renderSoon();
      const obj = cropBoxRef.current;
      if (!obj) return;
      const center: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
      const extents: [number, number, number] = [
        Math.max(1e-6, Math.abs(obj.scale.x)),
        Math.max(1e-6, Math.abs(obj.scale.y)),
        Math.max(1e-6, Math.abs(obj.scale.z)),
      ];
      onCropChangeRef.current?.(center, extents);
    });
    scene.add(cropGizmoHelper);
    cropGizmoRef.current = cropGizmo;
    cropGizmoHelperRef.current = cropGizmoHelper;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    setSceneReady(true);

    const handleResize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderSoon();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);
    window.addEventListener("resize", handleResize);

    let frameId = 0;
    let pageVisible = document.visibilityState !== "hidden";
    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState !== "hidden";
      if (pageVisible) {
        renderSoon();
        handleResize();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!pageVisible) return;
      const now = performance.now();
      const idleRenderMinFrameMs = isVmSafeGraphicsMode()
        ? VM_SAFE_IDLE_RENDER_MIN_FRAME_MS
        : IDLE_RENDER_MIN_FRAME_MS;
      if (!controlsInteractionActive && now - lastRenderedAt < idleRenderMinFrameMs) {
        return;
      }
      if (controlsInteractionActive) controls.update();
      lastRenderedAt = now;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      resourceDiagnostics.snapshot("before-cleanup");
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controls.removeEventListener("start", handleControlsStart);
      controls.removeEventListener("end", handleControlsEnd);
      controls.removeEventListener("change", renderSoon);
      controls.dispose();

      if (sliceMeshRef.current) {
        scene.remove(sliceMeshRef.current);
        disposeMesh(sliceMeshRef.current);
        sliceMeshRef.current = null;
      }
      if (isoMeshRef.current) {
        scene.remove(isoMeshRef.current);
        disposeMesh(isoMeshRef.current);
        isoMeshRef.current = null;
      }
      if (contourGroupRef.current) {
        clearGroup(contourGroupRef.current);
        scene.remove(contourGroupRef.current);
        contourGroupRef.current = null;
      }
      if (streamlinesGroupRef.current) {
        clearGroup(streamlinesGroupRef.current);
        scene.remove(streamlinesGroupRef.current);
        streamlinesGroupRef.current = null;
      }
      if (hoverMarkerRef.current) {
        scene.remove(hoverMarkerRef.current);
        disposeObject3DResources(hoverMarkerRef.current);
        hoverMarkerRef.current = null;
      }
      if (crosshairGroupRef.current) {
        clearGroup(crosshairGroupRef.current);
        scene.remove(crosshairGroupRef.current);
        crosshairGroupRef.current = null;
      }
      if (isoMarkerRef.current) {
        scene.remove(isoMarkerRef.current);
        disposeObject3DResources(isoMarkerRef.current);
        isoMarkerRef.current = null;
      }
      if (cropBoxRef.current) {
        scene.remove(cropBoxRef.current);
        disposeObject3DResources(cropBoxRef.current);
        cropBoxRef.current = null;
      }
      if (cropGizmoHelperRef.current) {
        scene.remove(cropGizmoHelperRef.current);
        cropGizmoHelperRef.current = null;
      }
      if (cropGizmoRef.current) {
        cropGizmoRef.current.dispose();
        cropGizmoRef.current = null;
      }
      if (sliceTextureRef.current) {
        sliceTextureRef.current.dispose();
        sliceTextureRef.current = null;
      }
      disposeRendererResources(renderer);
      removeWebGLContextLogger();
      renderer.domElement.remove();
      resourceDiagnostics.unregister("after-cleanup");
    };
  }, []);

  useEffect(() => {
    if (!dataset?.grid) {
      setSliceData(null);
      setSliceImage(null);
      setHoverInfo(null);
      if (onSliceReport) onSliceReport(null);
      return;
    }
    const data = sliceVolumeData(dataset.grid, axis, index);
    setSliceData(data);
  }, [dataset, axis, index, onSliceReport]);

  useEffect(() => {
    if (!sliceData || !dataset?.grid) {
      setSliceImage(null);
      return;
    }

    let cancelled = false;
    const grid = dataset.grid;
    const total = grid.dims[0] * grid.dims[1] * grid.dims[2];
    const canUseVtk = supportsVtkVolumeSlice() && total > VTK_SLICE_THRESHOLD;
    const plane = sliceData.plane;
    const windowReq = sliceWindow ? { low: sliceWindow.low, high: sliceWindow.high } : undefined;
    const planeReq = plane
      ? {
          center: plane.center,
          normal: plane.normal,
          u: plane.u,
          v: plane.v,
          width: plane.width,
          height: plane.height,
          resolution: [sliceData.width, sliceData.height] as [number, number],
        }
      : undefined;

    (async () => {
      if (canUseVtk) {
        const res = await vtkVolumeSlice({
          dims: grid.dims,
          scalars: grid.scalars,
          axis,
          index,
          spacing: grid.spacing,
          origin: grid.origin,
          plane: planeReq,
          window: windowReq,
        });
        if (!cancelled && res.ok) {
          setSliceImage({
            width: res.width,
            height: res.height,
            format: "rgba8",
            data: res.data,
            worldPlane: plane,
          });
          return;
        }
      }
      if (!cancelled) {
        setSliceImage(buildSliceImage(sliceData, sliceWindow ?? undefined));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sliceData, sliceWindow, dataset, axis, index]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!sliceData || !sliceImage) {
      if (sliceMeshRef.current) {
        scene.remove(sliceMeshRef.current);
        disposeMesh(sliceMeshRef.current);
        sliceMeshRef.current = null;
      }
      if (sliceTextureRef.current) {
        sliceTextureRef.current.dispose();
        sliceTextureRef.current = null;
      }
      return;
    }

    const plane = sliceImage.worldPlane ?? sliceData.plane;
    const image = sliceImage;

    let texture = sliceTextureRef.current;
    if (!texture || texture.image.width !== image.width || texture.image.height !== image.height) {
      if (texture) texture.dispose();
      texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      sliceTextureRef.current = texture;
    } else {
      texture.image.data = image.data;
      texture.needsUpdate = true;
    }

    const safeOpacity = Math.min(1, Math.max(0, opacityRef.current));
    let mesh = sliceMeshRef.current;
    if (!mesh) {
      const geom = new THREE.PlaneGeometry(plane?.width ?? 1, plane?.height ?? 1);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: safeOpacity < 1,
        opacity: safeOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 3;
      scene.add(mesh);
      sliceMeshRef.current = mesh;
    } else {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map = texture;
      mat.opacity = safeOpacity;
      mat.transparent = safeOpacity < 1;
      mat.needsUpdate = true;

      const geom = mesh.geometry as THREE.PlaneGeometry;
      const params = geom.parameters as { width: number; height: number };
      if (Math.abs(params.width - plane.width) > 1e-6 || Math.abs(params.height - plane.height) > 1e-6) {
        geom.dispose();
        mesh.geometry = new THREE.PlaneGeometry(plane.width, plane.height);
      }
    }

    if (plane && mesh) {
      mesh.position.set(plane.center[0], plane.center[1], plane.center[2]);
      const u = new THREE.Vector3(...plane.u).normalize();
      const v = new THREE.Vector3(...plane.v).normalize();
      const n = new THREE.Vector3(...plane.normal).normalize();
      const basis = new THREE.Matrix4().makeBasis(u, v, n);
      mesh.setRotationFromMatrix(basis);
    }
  }, [sliceData, sliceImage]);

  useEffect(() => {
    if (!sliceData || !sliceWindow || !onSliceReport) {
      if (onSliceReport) onSliceReport(null);
      return;
    }
    onSliceReport({
      ...sliceData.stats,
      width: sliceData.width,
      height: sliceData.height,
      window: sliceWindow,
    });
  }, [sliceData, sliceWindow, onSliceReport]);

  useEffect(() => {
    const group = contourGroupRef.current;
    if (!group) return;

    clearGroup(group);
    if (!sliceData || !contourEnabled) return;

    const count = Math.max(1, Math.min(16, Math.round(contourCount)));
    const low = sliceWindow?.low ?? sliceData.stats.min;
    const high = sliceWindow?.high ?? sliceData.stats.max;
    const span = high - low;
    if (!Number.isFinite(span) || Math.abs(span) < 1e-12) return;

    const levels: number[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      levels.push(low + t * span);
    }

    const polylines = volumeSliceContours(sliceData, levels);
    if (!polylines.length) return;

    const n = new THREE.Vector3(...sliceData.plane.normal).normalize();
    const offset = Math.max(1e-4, Math.min(sliceData.plane.width, sliceData.plane.height) * 0.002);
    const offsetVec = n.multiplyScalar(offset);

    for (const line of polylines) {
      if (line.length < 2) continue;
      const points = line.map((pt) => new THREE.Vector3(pt.x, pt.y, pt.z).add(offsetVec));
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: 0x1f3556,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Line(geom, mat);
      mesh.renderOrder = 4;
      group.add(mesh);
    }
  }, [sliceData, contourEnabled, contourCount, sliceWindow]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;

    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane();
    const tmp = new THREE.Vector3();

    const pickAt = (clientX: number, clientY: number) => {
      const data = sliceDataRef.current;
      const grid = datasetRef.current?.grid;
      if (!data || !grid) return null;

      const rect = dom.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const normal = new THREE.Vector3(...data.plane.normal).normalize();
      const center = new THREE.Vector3(...data.plane.center);
      plane.setFromNormalAndCoplanarPoint(normal, center);
      const hit = raycaster.ray.intersectPlane(plane, tmp);
      if (!hit) return null;

      const u = new THREE.Vector3(...data.plane.u).normalize();
      const v = new THREE.Vector3(...data.plane.v).normalize();
      const rel = hit.clone().sub(center);
      const s = rel.dot(u);
      const t = rel.dot(v);
      const halfW = data.plane.width * 0.5;
      const halfH = data.plane.height * 0.5;
      if (Math.abs(s) > halfW + 1e-6 || Math.abs(t) > halfH + 1e-6) {
        return null;
      }

      const world: [number, number, number] = [hit.x, hit.y, hit.z];
      const value = sampleGridTrilinear(grid, world);
      const gradMag = gradientMagnitudeAt(grid, world);
      return { world, value, gradMag };
    };

    const process = () => {
      hoverRafRef.current = null;
      const pending = hoverPendingRef.current;
      if (!pending) return;
      const hit = pickAt(pending.x, pending.y);
      if (!hit) {
        setHoverInfo(null);
        return;
      }

      const { world, value, gradMag } = hit;
      const prev = hoverInfoRef.current;
      if (
        prev &&
        Math.abs(prev.world[0] - world[0]) < 1e-6 &&
        Math.abs(prev.world[1] - world[1]) < 1e-6 &&
        Math.abs(prev.world[2] - world[2]) < 1e-6
      ) {
        return;
      }
      setHoverInfo({ world, value, gradMag });
    };

    let lastHoverAt = 0;
    const handleMove = (e: PointerEvent) => {
      hoverPendingRef.current = { x: e.clientX, y: e.clientY };
      const now = performance.now();
      const hoverMinFrameMs = isVmSafeGraphicsMode() ? VM_SAFE_HOVER_MIN_FRAME_MS : 0;
      if (hoverMinFrameMs > 0 && now - lastHoverAt < hoverMinFrameMs) return;
      lastHoverAt = now;
      if (hoverRafRef.current !== null) return;
      hoverRafRef.current = window.requestAnimationFrame(process);
    };

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0 || cropDraggingRef.current) return;
      const hit = pickAt(e.clientX, e.clientY);
      if (!hit) return;
      onSlicePickRef.current?.(hit.world);
    };

    const handleLeave = () => {
      hoverPendingRef.current = null;
      if (hoverRafRef.current !== null) {
        window.cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      setHoverInfo(null);
    };

    dom.addEventListener("pointermove", handleMove);
    dom.addEventListener("click", handleClick);
    dom.addEventListener("pointerleave", handleLeave);

    return () => {
      dom.removeEventListener("pointermove", handleMove);
      dom.removeEventListener("click", handleClick);
      dom.removeEventListener("pointerleave", handleLeave);
      if (hoverRafRef.current !== null) {
        window.cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const data = sliceDataRef.current;

    if (!hoverInfo || !data) {
      if (hoverMarkerRef.current) {
        scene.remove(hoverMarkerRef.current);
        disposeObject3DResources(hoverMarkerRef.current);
        hoverMarkerRef.current = null;
      }
      return;
    }

    const normal = new THREE.Vector3(...data.plane.normal).normalize();
    const offset = Math.max(1e-4, Math.min(data.plane.width, data.plane.height) * 0.003);
    const radius = Math.max(0.01, Math.min(data.plane.width, data.plane.height) * 0.01);

    if (!hoverMarkerRef.current) {
      const geom = new THREE.SphereGeometry(radius, 14, 14);
      const mat = new THREE.MeshBasicMaterial({ color: 0xe1563b });
      const marker = new THREE.Mesh(geom, mat);
      marker.renderOrder = 7;
      hoverMarkerRef.current = marker;
      scene.add(marker);
    }

    hoverMarkerRef.current.position.set(hoverInfo.world[0], hoverInfo.world[1], hoverInfo.world[2]);
    hoverMarkerRef.current.position.add(normal.multiplyScalar(offset));
  }, [hoverInfo]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!crosshair || !dataset?.grid) {
      if (crosshairGroupRef.current) {
        clearGroup(crosshairGroupRef.current);
        scene.remove(crosshairGroupRef.current);
        crosshairGroupRef.current = null;
      }
      return;
    }

    const bounds = getGridBounds(dataset.grid);
    const [x, y, z] = crosshair;

    let group = crosshairGroupRef.current;
    if (!group) {
      group = new THREE.Group();
      group.renderOrder = 8;
      scene.add(group);
      crosshairGroupRef.current = group;
    } else {
      clearGroup(group);
    }

    const makeLine = (a: THREE.Vector3, b: THREE.Vector3) => {
      const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
      const mat = new THREE.LineBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 8;
      return line;
    };

    group.add(makeLine(new THREE.Vector3(bounds.min[0], y, z), new THREE.Vector3(bounds.max[0], y, z)));
    group.add(makeLine(new THREE.Vector3(x, bounds.min[1], z), new THREE.Vector3(x, bounds.max[1], z)));
    group.add(makeLine(new THREE.Vector3(x, y, bounds.min[2]), new THREE.Vector3(x, y, bounds.max[2])));

    const radius = Math.max(0.01, bounds.diag * 0.012);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x2563eb, depthTest: false, depthWrite: false })
    );
    marker.position.set(x, y, z);
    marker.renderOrder = 9;
    group.add(marker);
  }, [crosshair, dataset]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!showIsosurface || !crosshair || !isoMeshRef.current) {
      if (isoMarkerRef.current) {
        scene.remove(isoMarkerRef.current);
        disposeObject3DResources(isoMarkerRef.current);
        isoMarkerRef.current = null;
      }
      return;
    }

    const geom = isoMeshRef.current.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    const nearest = findNearestPointOnMesh(geom, new THREE.Vector3(...crosshair));
    if (!nearest) return;

    const bounds = dataset?.grid ? getGridBounds(dataset.grid) : null;
    const radius = Math.max(0.01, (bounds?.diag ?? 1) * 0.012);

    let marker = isoMarkerRef.current;
    if (!marker) {
      marker = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false })
      );
      marker.renderOrder = 9;
      isoMarkerRef.current = marker;
      scene.add(marker);
    } else {
      const geomSphere = marker.geometry as THREE.SphereGeometry;
      if (geomSphere.parameters.radius !== radius) {
        marker.geometry.dispose();
        marker.geometry = new THREE.SphereGeometry(radius, 14, 14);
      }
    }

    marker.position.copy(nearest);
  }, [crosshair, showIsosurface, isoMeshToken, dataset]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!showCropBox || !cropCenter || !cropExtents) {
      if (cropBoxRef.current) {
        scene.remove(cropBoxRef.current);
        disposeObject3DResources(cropBoxRef.current);
        cropBoxRef.current = null;
      }
      if (cropGizmoRef.current) {
        cropGizmoRef.current.detach();
      }
      if (cropGizmoHelperRef.current) {
        cropGizmoHelperRef.current.visible = false;
      }
      return;
    }

    if (!cropBoxRef.current) {
      const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
      const mat = new THREE.LineBasicMaterial({
        color: 0x6b7280,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
      });
      const box = new THREE.LineSegments(geom, mat);
      box.renderOrder = 2;
      cropBoxRef.current = box;
      scene.add(box);
    }

    if (!cropDraggingRef.current && cropBoxRef.current) {
      cropBoxRef.current.position.set(cropCenter[0], cropCenter[1], cropCenter[2]);
      cropBoxRef.current.scale.set(
        Math.max(1e-6, cropExtents[0]),
        Math.max(1e-6, cropExtents[1]),
        Math.max(1e-6, cropExtents[2])
      );
    }

    if (cropGizmoRef.current && cropBoxRef.current) {
      cropGizmoRef.current.attach(cropBoxRef.current);
      const enabled = !!cropGizmoEnabled && !!showCropBox;
      cropGizmoRef.current.enabled = enabled;
      if (cropGizmoHelperRef.current) {
        cropGizmoHelperRef.current.visible = enabled;
      }
    }
  }, [showCropBox, cropCenter, cropExtents, cropGizmoEnabled]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!showIsosurface || !dataset?.grid) {
      if (isoMeshRef.current) {
        scene.remove(isoMeshRef.current);
        disposeMesh(isoMeshRef.current);
        isoMeshRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      const res = await vtkVolumeIsosurface({
        dims: dataset.grid.dims,
        scalars: dataset.grid.scalars,
        iso: isoValue,
        spacing: dataset.grid.spacing,
        origin: dataset.grid.origin,
      });

      if (cancelled) return;
      if (!res.ok) {
        const cpu = buildCpuIsosurface(dataset.grid, isoValue);
        if (!cpu) {
          if (isoMeshRef.current) {
            scene.remove(isoMeshRef.current);
            disposeMesh(isoMeshRef.current);
            isoMeshRef.current = null;
          }
          console.warn("[volume] isosurface failed", res.error);
          return;
        }

        let mesh = isoMeshRef.current;
        if (!mesh) {
          const geom = new THREE.BufferGeometry();
          const mat = new THREE.MeshStandardMaterial({
            color: 0x5b6f91,
            roughness: 0.4,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });
          mesh = new THREE.Mesh(geom, mat);
          mesh.renderOrder = 1;
          scene.add(mesh);
          isoMeshRef.current = mesh;
        }

        mesh.geometry.dispose();
        mesh.geometry = cpu;
        mesh.position.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        setIsoMeshToken((t) => t + 1);
        return;
      }

      let meshData = res;
      if (isoSmoothing) {
        const smoothRes = await vtkSmooth(meshData.positions, meshData.indices, {
          iterations: isoSmoothingIterations,
          passband: 0.1,
          computeNormals: true,
        });
        if (!cancelled && smoothRes.ok) {
          meshData = smoothRes;
        }
      }

      if (cancelled) return;

      let mesh = isoMeshRef.current;
      if (!mesh) {
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.MeshStandardMaterial({
          color: 0x5b6f91,
          roughness: 0.4,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 1;
        scene.add(mesh);
        isoMeshRef.current = mesh;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
      geom.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
      if (meshData.normals && meshData.normals.length) {
        geom.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
      } else {
        geom.computeVertexNormals();
      }
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

      mesh.geometry.dispose();
      mesh.geometry = geom;
      mesh.position.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      setIsoMeshToken((t) => t + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [dataset, showIsosurface, isoValue, isoSmoothing, isoSmoothingIterations]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (streamlinesGroupRef.current) {
      scene.remove(streamlinesGroupRef.current);
      clearGroup(streamlinesGroupRef.current);
      streamlinesGroupRef.current = null;
    }

    if (!showStreamlines || !vectorGrid || !streamlineSeeds?.length) return;

    let cancelled = false;

    (async () => {
      const res = await vtkVolumeStreamlines({
        dims: vectorGrid.dims,
        vectors: vectorGrid.vectors,
        spacing: vectorGrid.spacing,
        origin: vectorGrid.origin,
        seeds: streamlineSeeds,
        stepSize: streamlineStepSize,
        maxSteps: streamlineMaxSteps,
        maxLength: streamlineMaxLength,
      });

      if (cancelled || !res.ok) {
        if (!res.ok) {
          console.warn("[volume] streamlines failed", res.error);
        }
        return;
      }

      const spacing = vectorGrid.spacing ?? [1, 1, 1];
      const dims = vectorGrid.dims;
      const spanX = Math.max(0, (dims[0] - 1) * spacing[0]);
      const spanY = Math.max(0, (dims[1] - 1) * spacing[1]);
      const spanZ = Math.max(0, (dims[2] - 1) * spacing[2]);
      const diag = Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ);
      const tubeRadius = Math.max(0.0012, diag * 0.004);
      const radialSegments = 8;

      const group = new THREE.Group();
      group.renderOrder = 4;

      for (const line of res.lines) {
        if (!line || line.length < 2) continue;
        const points = line.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const path = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i + 1 < points.length; i++) {
          path.add(new THREE.LineCurve3(points[i], points[i + 1]));
        }
        const tubularSegments = Math.min(2000, Math.max(60, points.length * 3));
        const geom = new THREE.TubeGeometry(path, tubularSegments, tubeRadius, radialSegments, false);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x1f9fbf,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          depthWrite: false,
        });
        const tube = new THREE.Mesh(geom, mat);
        tube.renderOrder = 4;
        tube.frustumCulled = false;
        group.add(tube);
      }

      if (!group.children.length) return;
      scene.add(group);
      streamlinesGroupRef.current = group;
    })();

    return () => {
      cancelled = true;
    };
  }, [
    showStreamlines,
    vectorGrid,
    streamlineSeeds,
    streamlineStepSize,
    streamlineMaxSteps,
    streamlineMaxLength,
  ]);

  useEffect(() => {
    const mesh = sliceMeshRef.current;
    if (!mesh) return;
    const safeOpacity = Math.min(1, Math.max(0, opacity));
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = safeOpacity;
    mat.transparent = safeOpacity < 1;
    mat.needsUpdate = true;
  }, [opacity]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
};
