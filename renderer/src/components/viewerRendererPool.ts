import * as THREE from "three";

// Module navigation used to allocate a new WebGL context for every Mesh and
// Volume visit. Chromium can retain the native allocations of lost contexts
// long after their JavaScript owners are collected. Retain at most one context
// for each pane of the four-view Volume layout. The orthogonal panes use a
// non-antialiased context and the spatial pane shares its antialiased context
// with Mesh and Surface routes.
const MAX_IDLE_RENDERERS = 4;
const idleRenderers: Array<{ renderer: THREE.WebGLRenderer; antialias: boolean }> = [];
const rendererAntialias = new WeakMap<THREE.WebGLRenderer, boolean>();
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
    for (const { renderer } of idleRenderers.splice(0)) destroyRenderer(renderer);
  }, { once: true });
}

export const acquireViewerRenderer = (antialias = true): THREE.WebGLRenderer => {
  const index = idleRenderers.findIndex(entry => entry.antialias === antialias);
  const renderer = index >= 0
    ? idleRenderers.splice(index, 1)[0]!.renderer
    : new THREE.WebGLRenderer({ antialias, alpha: true });
  if (index < 0) {
    rendererAntialias.set(renderer, antialias);
    if (idleRenderers.length >= MAX_IDLE_RENDERERS) destroyRenderer(idleRenderers.shift()!.renderer);
  }
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
    idleRenderers.push({ renderer, antialias: rendererAntialias.get(renderer) ?? true });
  }
};
