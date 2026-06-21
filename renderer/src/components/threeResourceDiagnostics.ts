import * as THREE from "three";

type ViewerKind = "surface" | "param-surface" | "volume";

type SceneCounts = {
  objects: number;
  meshes: number;
  lines: number;
  points: number;
  sprites: number;
  geometries: number;
  materials: number;
  textures: number;
};

type RendererCounts = {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
  triangles: number;
  points: number;
  lines: number;
};

export type ThreeResourceSnapshot = {
  viewerId: string;
  kind: ViewerKind;
  phase: string;
  active: boolean;
  ts: number;
  scene: SceneCounts;
  renderer: RendererCounts;
  drawingBuffer: { width: number; height: number };
};

type ThreeDiagnosticsStore = {
  viewers: Record<string, ThreeResourceSnapshot>;
  events: ThreeResourceSnapshot[];
  controls: Record<string, (phase: string) => ThreeResourceSnapshot | null>;
};

const MAX_EVENTS = 300;

const getStore = (): ThreeDiagnosticsStore | null => {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { __MATH3D_THREE_DIAGNOSTICS__?: ThreeDiagnosticsStore };
  if (!win.__MATH3D_THREE_DIAGNOSTICS__) {
    win.__MATH3D_THREE_DIAGNOSTICS__ = { viewers: {}, events: [], controls: {} };
    (win as typeof win & { __MATH3D_THREE_SNAPSHOT_ALL__?: (phase?: string) => ThreeResourceSnapshot[] }).__MATH3D_THREE_SNAPSHOT_ALL__ =
      (phase = "manual") => {
        const store = win.__MATH3D_THREE_DIAGNOSTICS__;
        if (!store) return [];
        return Object.values(store.controls)
          .map((snapshot) => snapshot(phase))
          .filter((snapshot): snapshot is ThreeResourceSnapshot => !!snapshot);
      };
  }
  return win.__MATH3D_THREE_DIAGNOSTICS__;
};

const collectSceneCounts = (scene: THREE.Scene): SceneCounts => {
  const geometries = new Set<string>();
  const materials = new Set<string>();
  const textures = new Set<string>();
  const counts: SceneCounts = {
    objects: 0,
    meshes: 0,
    lines: 0,
    points: 0,
    sprites: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
  };

  const collectMaterial = (material: THREE.Material | undefined) => {
    if (!material) return;
    materials.add(material.uuid);
    const anyMaterial = material as unknown as Record<string, unknown>;
    for (const value of Object.values(anyMaterial)) {
      if (value && typeof value === "object" && (value as THREE.Texture).isTexture) {
        textures.add((value as THREE.Texture).uuid);
      }
    }
  };

  scene.traverse((object) => {
    counts.objects += 1;
    const anyObject = object as unknown as {
      isMesh?: boolean;
      isLine?: boolean;
      isPoints?: boolean;
      isSprite?: boolean;
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (anyObject.isMesh) counts.meshes += 1;
    if (anyObject.isLine) counts.lines += 1;
    if (anyObject.isPoints) counts.points += 1;
    if (anyObject.isSprite) counts.sprites += 1;
    if (anyObject.geometry) geometries.add(anyObject.geometry.uuid);
    const material = anyObject.material;
    if (Array.isArray(material)) {
      material.forEach(collectMaterial);
    } else {
      collectMaterial(material);
    }
  });

  counts.geometries = geometries.size;
  counts.materials = materials.size;
  counts.textures = textures.size;
  return counts;
};

const collectRendererCounts = (renderer: THREE.WebGLRenderer): RendererCounts => {
  const info = renderer.info;
  return {
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    calls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
  };
};

export const registerThreeResourceDiagnostics = (
  kind: ViewerKind,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
) => {
  const viewerId = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let active = true;

  const snapshot = (phase: string): ThreeResourceSnapshot | null => {
    const store = getStore();
    if (!store) return null;
    const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    const next: ThreeResourceSnapshot = {
      viewerId,
      kind,
      phase,
      active,
      ts: Date.now(),
      scene: collectSceneCounts(scene),
      renderer: collectRendererCounts(renderer),
      drawingBuffer: { width: drawingBuffer.x, height: drawingBuffer.y },
    };
    store.viewers[viewerId] = next;
    store.events.push(next);
    if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS);
    return next;
  };

  snapshot("mount");
  const store = getStore();
  if (store) store.controls[viewerId] = snapshot;

  return {
    viewerId,
    snapshot,
    unregister: (phase = "unmount") => {
      active = false;
      const last = snapshot(phase);
      const nextStore = getStore();
      if (nextStore) delete nextStore.controls[viewerId];
      return last;
    },
  };
};
