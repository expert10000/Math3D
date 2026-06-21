import * as THREE from "three";
import {
  addMemoryGauge,
  bumpMemoryCounter,
  setMemoryGauge,
} from "../diagnostics/memoryDiagnostics";

const registeredRenderers = new WeakSet<THREE.WebGLRenderer>();
const disposedRenderers = new WeakSet<THREE.WebGLRenderer>();

export const registerWebGLRenderer = <T extends THREE.WebGLRenderer>(renderer: T): T => {
  if (registeredRenderers.has(renderer)) return renderer;
  registeredRenderers.add(renderer);
  bumpMemoryCounter("webgl.contextsCreated");
  addMemoryGauge("webgl.contextsActive", 1);
  return renderer;
};

export const disposeMaterialResources = (material: THREE.Material) => {
  const textures = new Set<THREE.Texture>();
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if ((value as THREE.Texture | undefined)?.isTexture) textures.add(value as THREE.Texture);
  }
  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  if (uniforms) {
    for (const uniform of Object.values(uniforms)) {
      const value = uniform?.value;
      if ((value as THREE.Texture | undefined)?.isTexture) textures.add(value as THREE.Texture);
    }
  }
  for (const texture of textures) texture.dispose();
  material.dispose();
  bumpMemoryCounter("webgl.materialsDisposed");
  bumpMemoryCounter("webgl.texturesDisposed", textures.size);
};

export const disposeObject3DResources = (object: THREE.Object3D) => {
  const resource = object as THREE.Object3D & {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material | THREE.Material[];
  };
  if (resource.geometry) {
    resource.geometry.dispose();
    bumpMemoryCounter("webgl.geometriesDisposed");
  }
  if (resource.material) {
    const materials = Array.isArray(resource.material) ? resource.material : [resource.material];
    for (const material of materials) disposeMaterialResources(material);
  }
};

export const disposeSceneResources = (root: THREE.Object3D) => {
  root.traverse(disposeObject3DResources);
};

export const disposeWebGLRenderer = (
  renderer: THREE.WebGLRenderer,
  options: { forceContextLoss?: boolean } = {}
) => {
  if (disposedRenderers.has(renderer)) return;
  disposedRenderers.add(renderer);
  setMemoryGauge("webgl.lastGeometries", renderer.info.memory.geometries ?? 0);
  setMemoryGauge("webgl.lastTextures", renderer.info.memory.textures ?? 0);
  renderer.renderLists.dispose();
  renderer.dispose();
  if (options.forceContextLoss !== false) {
    renderer.forceContextLoss();
    bumpMemoryCounter("webgl.contextsForcedLost");
  }
  bumpMemoryCounter("webgl.contextsDisposed");
  addMemoryGauge("webgl.contextsActive", -1);
};
