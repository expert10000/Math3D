import * as THREE from "three";

// Module navigation used to allocate a new WebGL context for every Mesh and
// Volume visit. Chromium can retain the native allocations of lost contexts
// long after their JavaScript owners are collected. Keep the four Volume
// contexts separate from the Surface/Mesh context so their drawing buffers
// can remain stable across route changes.
type ViewerRendererRole = "general" | "volume-spatial" | "volume-slice";
const MAX_IDLE_RENDERERS = 5;
const idleRenderers: Array<{ renderer: THREE.WebGLRenderer; antialias: boolean; role: ViewerRendererRole }> = [];
const rendererIdentity = new WeakMap<THREE.WebGLRenderer, { antialias: boolean; role: ViewerRendererRole }>();
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

export const acquireViewerRenderer = (antialias = true, role: ViewerRendererRole = "general"): THREE.WebGLRenderer => {
  if (role === "volume-spatial" && !antialias || role === "volume-slice" && antialias)
    throw new TypeError("Volume renderer role and antialias setting disagree.");
  const index = idleRenderers.findIndex(entry => entry.antialias === antialias && entry.role === role);
  const renderer = index >= 0
    ? idleRenderers.splice(index, 1)[0]!.renderer
    : new THREE.WebGLRenderer({ antialias, alpha: true });
  if (index < 0) {
    rendererIdentity.set(renderer, { antialias, role });
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
    const { antialias, role } = rendererIdentity.get(renderer) ?? { antialias: true, role: "general" };
    // Keep the backing buffer while this bounded context is idle. Shrinking it
    // to 1x1 on every route exit forces ANGLE to allocate a new multisampled
    // buffer on the next Surface/Volume visit.
    idleRenderers.push({ renderer, antialias, role });
  }
};
