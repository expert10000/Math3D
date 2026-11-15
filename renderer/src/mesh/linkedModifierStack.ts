import { applyMeshTopologyEditDefinition, resolveMeshTopologyEditDefinitionTarget, type MeshTopologyEditDefinition } from "./topologyEditDefinition";
import type { SurfaceMeshData } from "./surfaceMesh";

export type LinkedMeshModifier = {
  readonly id: string;
  readonly definition: MeshTopologyEditDefinition;
  readonly enabled: boolean;
  /** Connectivity of the input the user edited; positions may change freely. */
  readonly sourceConnectivity?: string;
};

export function meshConnectivityKey(mesh: SurfaceMeshData): string {
  let hash = 2166136261;
  const indices = mesh.indices;
  const count = indices?.length ?? mesh.positions.length / 3;
  for (let i = 0; i < count; i++) {
    hash ^= indices ? indices[i] : i;
    hash = Math.imul(hash, 16777619);
  }
  return `${Math.floor(mesh.positions.length / 3)}:${count}:${hash >>> 0}`;
}

export type LinkedMeshModifierResult = {
  readonly id: string;
  readonly status: "applied" | "disabled" | "failed" | "blocked";
  readonly reason: string | null;
  readonly before: SurfaceMeshData;
  readonly after: SurfaceMeshData;
};

export function replayLinkedMeshModifiers(base: SurfaceMeshData, stack: readonly LinkedMeshModifier[]): {
  readonly mesh: SurfaceMeshData;
  readonly results: readonly LinkedMeshModifierResult[];
  readonly ok: boolean;
} {
  let mesh = base;
  let failed = false;
  const results: LinkedMeshModifierResult[] = [];
  for (const modifier of stack) {
    if (!modifier.enabled) {
      results.push({ id: modifier.id, status: "disabled", reason: null, before: mesh, after: mesh });
      continue;
    }
    if (failed) {
      results.push({ id: modifier.id, status: "blocked", reason: "An earlier modifier failed.", before: mesh, after: mesh });
      continue;
    }
    if (modifier.sourceConnectivity && meshConnectivityKey(mesh) !== modifier.sourceConnectivity) {
      failed = true;
      results.push({ id: modifier.id, status: "failed", reason: "Source connectivity changed; retarget this modifier before replay.", before: mesh, after: mesh });
      continue;
    }
    const resolved = resolveMeshTopologyEditDefinitionTarget(mesh, modifier.definition);
    if (!resolved.ok) {
      failed = true;
      results.push({ id: modifier.id, status: "failed", reason: resolved.reason, before: mesh, after: mesh });
      continue;
    }
    try {
      const before = mesh;
      mesh = applyMeshTopologyEditDefinition(mesh, modifier.definition);
      results.push({ id: modifier.id, status: "applied", reason: null, before, after: mesh });
    } catch (error) {
      failed = true;
      results.push({ id: modifier.id, status: "failed", reason: error instanceof Error ? error.message : String(error), before: mesh, after: mesh });
    }
  }
  return { mesh, results, ok: !failed };
}

export function reorderLinkedMeshModifier(stack: readonly LinkedMeshModifier[], id: string, direction: -1 | 1): readonly LinkedMeshModifier[] {
  const index = stack.findIndex((item) => item.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= stack.length) return stack;
  const next = [...stack];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
