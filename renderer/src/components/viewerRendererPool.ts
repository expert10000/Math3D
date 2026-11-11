import * as THREE from "three";

// Module navigation used to allocate a new WebGL context for every Mesh and
// Volume visit. Chromium can retain the native allocations of lost contexts
// long after their JavaScript owners are collected. Reuse idle contexts while
// keeping a small, explicit ceiling for concurrent Study panes.
// The Volume comparison route mounts four simultaneous viewers.
const MAX_IDLE_RENDERERS = 4;
const idleRenderers: THREE.WebGLRenderer[] = [];
let pageUnloading = false;

const destroyRenderer = (renderer: THREE.WebGLRenderer): void => {
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    pageUnloading = true;
    for (const renderer of idleRenderers.splice(0)) destroyRenderer(renderer);
  }, { once: true });
}

export const acquireViewerRenderer = (): THREE.WebGLRenderer => {
  const renderer = idleRenderers.pop() ?? new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.resetState();
  renderer.localClippingEnabled = true;
  return renderer;
};

export const releaseViewerRenderer = (renderer: THREE.WebGLRenderer): void => {
  renderer.setAnimationLoop(null);
  renderer.setRenderTarget(null);
  renderer.renderLists.dispose();
  renderer.resetState();
  renderer.domElement.remove();
  if (pageUnloading || idleRenderers.length >= MAX_IDLE_RENDERERS) {
    destroyRenderer(renderer);
  } else {
    idleRenderers.push(renderer);
  }
};
