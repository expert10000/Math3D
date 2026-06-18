import type { WebGLRendererParameters } from "three";

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

const readVmSafeFlag = (): boolean => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const query = params.get("vmSafeGraphics");
  if (query && truthy.has(query.toLowerCase())) return true;
  if (query && falsy.has(query.toLowerCase())) return false;
  try {
    const stored = window.localStorage.getItem("math3d.vmSafeGraphics");
    if (stored && truthy.has(stored.toLowerCase())) return true;
    if (stored && falsy.has(stored.toLowerCase())) return false;
  } catch {
    // localStorage can be unavailable in restricted contexts.
  }
  return /\bLinux\b/i.test(window.navigator.userAgent);
};

export const isVmSafeGraphicsMode = (): boolean => readVmSafeFlag();

export const vmSafeRendererParams = (
  params: WebGLRendererParameters = {}
): WebGLRendererParameters => {
  if (!isVmSafeGraphicsMode()) return params;
  return {
    ...params,
    antialias: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
    stencil: false,
  };
};

export const vmSafePixelRatio = (target: number, maxPixelRatio: number): number => {
  if (isVmSafeGraphicsMode()) return 1;
  return Math.min(target, maxPixelRatio);
};

export const installWebGLContextLogger = (canvas: HTMLCanvasElement, label: string): (() => void) => {
  const onLost = (event: Event) => {
    event.preventDefault();
    console.error(`[graphics] ${label} WebGL context lost`);
  };
  const onRestored = () => {
    console.warn(`[graphics] ${label} WebGL context restored; reloading view`);
    window.setTimeout(() => window.location.reload(), 100);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  };
};
