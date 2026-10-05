import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { pickedMeshVertex } from "./savedMeshExploration";

/** A view of the saved buffers, independent of the live Surface's display mesh. */
export const SavedMeshStudyView = ({ mesh, colors, picking = false, onPick, onCancelPick, start, end, path }: { mesh: SurfaceMeshData; colors?: Float32Array | null; picking?: boolean; onPick?: (index: number) => void; onCancelPick?: () => void; start?: number; end?: number; path?: readonly number[] | null }) => {
  const host = useRef<HTMLDivElement>(null), runtime = useRef<{ geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial; overlays: THREE.Group; radius: number; fit: () => void; render: () => void } | null>(null);
  const pickState = useRef({ picking, onPick, onCancelPick }); pickState.current = { picking, onPick, onCancelPick };
  const [error, setError] = useState("");
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); setError(""); }
    catch (failure) { setError(`Saved Mesh view unavailable: ${(failure as Error).message}`); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xf1f5f9);
    renderer.domElement.setAttribute("aria-label", "Saved Mesh study: drag to orbit, wheel to zoom");
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions.slice(), 3));
    if (mesh.indices) geometry.setIndex(new THREE.BufferAttribute(mesh.indices.slice(), 1));
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ color: 0x4a6aaa, side: THREE.DoubleSide });
    const surface = new THREE.Mesh(geometry, material), overlays = new THREE.Group();
    scene.add(surface, overlays);
    const camera = new THREE.PerspectiveCamera(40, 1, .001, 1000), controls = new OrbitControls(camera, renderer.domElement);
    const centre = geometry.boundingSphere?.center ?? new THREE.Vector3(), radius = Math.max(geometry.boundingSphere?.radius ?? 1, 1e-6);
    const render = () => renderer.render(scene, camera);
    const fit = () => {
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(20)) * Math.max(1, 1 / camera.aspect) * 1.15;
      camera.near = Math.max(radius * .001, 1e-9); camera.far = distance * 20;
      camera.position.copy(centre).add(new THREE.Vector3(1, .65, 1.5).normalize().multiplyScalar(distance));
      controls.target.copy(centre); camera.updateProjectionMatrix(); controls.update(); render();
    };
    const resize = () => { camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1); camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight); render(); };
    controls.addEventListener("change", render);
    const observer = new ResizeObserver(resize); observer.observe(container);
    let down: { x: number; y: number; button: number } | null = null;
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY, button: event.button }; };
    const pointerUp = (event: PointerEvent) => {
      const began = down; down = null;
      if (!pickState.current.picking || !began || began.button !== 0 || Math.hypot(event.clientX - began.x, event.clientY - began.y) > 5) return;
      const box = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(2 * (event.clientX - box.left) / box.width - 1, 1 - 2 * (event.clientY - box.top) / box.height), camera);
      const hit = ray.intersectObject(surface)[0];
      if (hit?.faceIndex != null) pickState.current.onPick?.(pickedMeshVertex(mesh, hit.faceIndex, hit.point));
    };
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { pickState.current.onCancelPick?.(); event.preventDefault(); } };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("keydown", keyDown);
    runtime.current = { geometry, material, overlays, radius, fit, render }; resize(); fit();
    return () => { runtime.current = null; observer.disconnect(); controls.dispose(); renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp); renderer.domElement.removeEventListener("keydown", keyDown); disposeOverlays(overlays); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
  }, [mesh]);
  useEffect(() => {
    const view = runtime.current; if (!view) return;
    if (colors) view.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); else view.geometry.deleteAttribute("color");
    view.material.vertexColors = !!colors; view.material.color.set(colors ? 0xffffff : 0x4a6aaa); view.material.needsUpdate = true; view.render();
  }, [mesh, colors]);
  useEffect(() => {
    const view = runtime.current; if (!view) return;
    disposeOverlays(view.overlays);
    const valid = (index: number | undefined): index is number => index !== undefined && Number.isSafeInteger(index) && index >= 0 && index < mesh.positions.length / 3;
    for (const [index, color] of [[start, 0x16a34a], [end, 0x9333ea]] as const) if (valid(index)) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(view.radius * .018, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      marker.position.fromArray(mesh.positions, 3 * index); marker.renderOrder = 2; view.overlays.add(marker);
    }
    if (path?.length && path.every(valid)) {
      const geometry = new THREE.BufferGeometry().setFromPoints(path.map(index => new THREE.Vector3().fromArray(mesh.positions, 3 * index)));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })); line.renderOrder = 1; view.overlays.add(line);
    }
    view.render();
  }, [mesh, start, end, path]);
  return <div style={{ maxWidth: 760 }}>
    <button type="button" data-testid="project-study-view-fit" onClick={() => runtime.current?.fit()}>Fit saved Mesh</button>
    <small> Drag to orbit · wheel to zoom</small>
    <div data-testid="project-study-viewport" ref={host} style={{ width: "100%", height: 340, border: "1px solid #94a3b8", borderRadius: 8, overflow: "hidden", boxSizing: "border-box", cursor: picking ? "crosshair" : "grab" }} />
    {error && <div role="alert">{error}</div>}
  </div>;
};

const disposeOverlays = (group: THREE.Group) => {
  for (const child of [...group.children]) {
    const item = child as THREE.Mesh;
    item.geometry?.dispose();
    const materials = Array.isArray(item.material) ? item.material : [item.material];
    materials.forEach(material => material?.dispose()); group.remove(child);
  }
};
