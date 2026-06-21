import * as THREE from "three";

const disposeTextureValue = (value: unknown): void => {
  if (value && typeof value === "object" && (value as THREE.Texture).isTexture) {
    (value as THREE.Texture).dispose();
  }
};

export const disposeMaterialResources = (material: THREE.Material | null | undefined): void => {
  if (!material) return;
  const materialRecord = material as unknown as Record<string, unknown>;
  for (const value of Object.values(materialRecord)) {
    if (Array.isArray(value)) {
      value.forEach(disposeTextureValue);
    } else {
      disposeTextureValue(value);
    }
  }
  material.dispose();
};

export const disposeMaterialOrMaterials = (
  material: THREE.Material | THREE.Material[] | null | undefined
): void => {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterialResources);
    return;
  }
  disposeMaterialResources(material);
};

export const disposeObject3DResources = (object: THREE.Object3D): void => {
  const objectWithResources = object as THREE.Object3D & {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material | THREE.Material[];
  };
  objectWithResources.geometry?.dispose();
  disposeMaterialOrMaterials(objectWithResources.material);
};

export const clearGroupResources = (group: THREE.Group | null | undefined): void => {
  if (!group) return;
  const children = [...group.children];
  for (const child of children) {
    child.traverse(disposeObject3DResources);
    group.remove(child);
  }
};

export const disposeRendererResources = (renderer: THREE.WebGLRenderer): void => {
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
};
