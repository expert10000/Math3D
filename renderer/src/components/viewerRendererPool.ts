import * as THREE from "three";

// Module navigation used to allocate a new WebGL context for every Mesh and
// Volume visit. Chromium can retain the native allocations of lost contexts
// long after their JavaScript owners are collected. Reuse one idle context for
// route changes. Concurrent Study panes hold their own active renderers; their
// count does not justify retaining four idle GPU contexts after they close.
const MAX_IDLE_RENDERERS = 1;
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
    for (const stale of idleRenderers.splice(0)) destroyRenderer(stale.renderer);
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
    // Keep the WebGL context warm without retaining the previous viewport's
    // multisampled drawing buffer while no viewer owns the canvas.
    renderer.setSize(1, 1, false);
    renderer.setPixelRatio(1);
    idleRenderers.push({ renderer, antialias: rendererAntialias.get(renderer) ?? true });
  }
};
