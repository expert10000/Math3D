import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { VolumeDataset } from "../scene/datasets";
import { getSliceInfo, sliceVolumeCpu, type SliceAxis } from "../scene/volume/sliceVolume";
import { vtkVolumeSlice } from "../services/vtkVolumeClient";

export type VolumeViewerProps = {
  dataset: VolumeDataset | null;
  axis: SliceAxis;
  index: number;
  opacity: number;
};

const disposeMesh = (mesh: THREE.Mesh) => {
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.Material | THREE.Material[];
  if (Array.isArray(mat)) {
    mat.forEach((m) => m.dispose());
  } else {
    mat.dispose();
  }
};

export const VolumeViewer: React.FC<VolumeViewerProps> = ({ dataset, axis, index, opacity }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sliceMeshRef = useRef<THREE.Mesh | null>(null);
  const sliceTextureRef = useRef<THREE.DataTexture | null>(null);
  const sliceRequestRef = useRef(0);
  const opacityRef = useRef(opacity);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
    camera.position.set(2.6, 2.4, 2.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controls.update();

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
    scene.add(axes);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    const handleResize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);
    window.addEventListener("resize", handleResize);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();

      if (sliceMeshRef.current) {
        scene.remove(sliceMeshRef.current);
        disposeMesh(sliceMeshRef.current);
        sliceMeshRef.current = null;
      }
      if (sliceTextureRef.current) {
        sliceTextureRef.current.dispose();
        sliceTextureRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!dataset?.grid) {
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

    const info = getSliceInfo(dataset.grid, axis, index);
    const requestId = ++sliceRequestRef.current;
    let cancelled = false;

    const applySlice = (slice: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }) => {
      if (cancelled || requestId !== sliceRequestRef.current) return;
      const plane = info.plane;

      let texture = sliceTextureRef.current;
      if (!texture || texture.image.width !== slice.width || texture.image.height !== slice.height) {
        if (texture) texture.dispose();
        texture = new THREE.DataTexture(slice.data, slice.width, slice.height, THREE.RGBAFormat);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        sliceTextureRef.current = texture;
      } else {
        texture.image.data = slice.data;
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

        if (plane) {
          const geom = mesh.geometry as THREE.PlaneGeometry;
          const params = geom.parameters as { width: number; height: number };
          if (Math.abs(params.width - plane.width) > 1e-6 || Math.abs(params.height - plane.height) > 1e-6) {
            geom.dispose();
            mesh.geometry = new THREE.PlaneGeometry(plane.width, plane.height);
          }
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
    };

    (async () => {
      const res = await vtkVolumeSlice({
        dims: dataset.grid.dims,
        scalars: dataset.grid.scalars,
        axis: info.axis,
        index: info.sliceIndex,
        spacing: dataset.grid.spacing,
        origin: dataset.grid.origin,
      });

      if (cancelled || requestId !== sliceRequestRef.current) return;

      if (res.ok && res.data.length) {
        const width = res.width || info.width;
        const height = res.height || info.height;
        applySlice({ width, height, data: res.data });
        return;
      }

      const fallback = sliceVolumeCpu(dataset.grid, axis, info.sliceIndex);
      applySlice({ width: fallback.width, height: fallback.height, data: fallback.data });
    })();

    return () => {
      cancelled = true;
    };
  }, [dataset, axis, index]);

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
