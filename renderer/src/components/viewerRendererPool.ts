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
let parkingHost: HTMLDivElement | null = null;
let rendererSerial = 0;

const countCanvasChange = (canvas: HTMLCanvasElement, key: "viewerPoolSizeChanges" | "viewerPoolPixelRatioChanges"): void => {
  canvas.dataset[key] = String(Number(canvas.dataset[key] ?? 0) + 1);
};

const parkCanvas = (canvas: HTMLCanvasElement): void => {
  if (typeof document === "undefined") {
    canvas.remove();
    return;
  }
  if (!parkingHost) {
    parkingHost = document.createElement("div");
    parkingHost.dataset.viewerRendererPool = "idle";
    parkingHost.style.cssText = "position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
    document.body.appendChild(parkingHost);
  }
  parkingHost.appendChild(canvas);
};

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
    parkingHost?.remove();
    parkingHost = null;
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
    renderer.domElement.dataset.viewerPoolSerial = String(++rendererSerial);
    renderer.domElement.dataset.viewerPoolRole = role;
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
  renderer.domElement.dataset.viewerPoolGeometries = String(renderer.info.memory.geometries);
  renderer.domElement.dataset.viewerPoolTextures = String(renderer.info.memory.textures);
  renderer.domElement.dataset.viewerPoolPrograms = String(renderer.info.programs?.length ?? 0);
  if (pageUnloading || idleRenderers.length >= MAX_IDLE_RENDERERS) {
    destroyRenderer(renderer);
  } else {
    const { antialias, role } = rendererIdentity.get(renderer) ?? { antialias: true, role: "general" };
    // Keep the bounded canvas attached while idle. Detaching or shrinking it
    // can make ANGLE allocate a new backing buffer on the next viewer visit.
    parkCanvas(renderer.domElement);
    idleRenderers.push({ renderer, antialias, role });
  }
};

// Three.js writes canvas.width/height on every setSize call, even when the
// dimensions are unchanged. That discards the drawing buffer and makes ANGLE
// allocate it again on each resize notification or pooled-viewer mount.
export const setViewerRendererPixelRatio = (renderer: THREE.WebGLRenderer, ratio: number): void => {
  if (renderer.getPixelRatio() !== ratio) {
    countCanvasChange(renderer.domElement, "viewerPoolPixelRatioChanges");
    renderer.setPixelRatio(ratio);
  }
};

export const setViewerRendererSize = (
  renderer: THREE.WebGLRenderer, width: number, height: number, updateStyle = true,
): void => {
  const current = renderer.getSize(new THREE.Vector2());
  if (current.x !== width || current.y !== height) {
    countCanvasChange(renderer.domElement, "viewerPoolSizeChanges");
    renderer.setSize(width, height, updateStyle);
  }
};
