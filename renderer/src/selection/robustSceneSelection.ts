import type { SceneSelection, ComponentRemap } from "./sceneSelection";
import { transferSceneSelection } from "./sceneSelection";
import { buildMeshEdgeTopology } from "../mesh/edgeSelection";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type NamedSceneSelection = {
  readonly id: string;
  readonly name: string;
  readonly selection: SceneSelection;
  readonly sourceRevision: number | null;
};

export type ComponentSelectionFilter = {
  readonly kinds: readonly SceneSelection["kind"][];
  readonly includeHidden: boolean;
  readonly sourceObjectId: string | null;
};

export type SelectionGraph = ReadonlyMap<string, readonly string[]>;

export function buildMeshComponentSelectionGraph(mesh: SurfaceMeshData, kind: "face" | "edge" | "vertex"): SelectionGraph {
  const topology = buildMeshEdgeTopology(mesh);
  const graph = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (a === b) return;
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)!.add(b); graph.get(b)!.add(a);
  };
  if (kind === "vertex") {
    for (const edge of topology.edges.values()) connect(`vertex:${edge.a}`, `vertex:${edge.b}`);
  } else if (kind === "face") {
    for (const edge of topology.edges.values()) {
      for (let i = 0; i < edge.faces.length; i++) for (let j = i + 1; j < edge.faces.length; j++) {
        connect(`face:${edge.faces[i]}`, `face:${edge.faces[j]}`);
      }
    }
  } else {
    for (const edgeKeys of topology.vertexEdges.values()) {
      for (let i = 0; i < edgeKeys.length; i++) for (let j = i + 1; j < edgeKeys.length; j++) {
        connect(`edge:${edgeKeys[i]}`, `edge:${edgeKeys[j]}`);
      }
    }
  }
  return new Map([...graph].map(([key, values]) => [key, [...values]]));
}

export function saveNamedSceneSelection(
  sets: readonly NamedSceneSelection[],
  name: string,
  selection: SceneSelection,
  sourceRevision: number | null,
  id: string,
): readonly NamedSceneSelection[] {
  const cleanName = name.trim();
  if (!cleanName || !selection.objectId) return sets;
  return [...sets.filter((set) => set.id !== id), {
    id, name: cleanName, selection: { ...selection, componentIds: [...new Set(selection.componentIds)] }, sourceRevision,
  }];
}

export function restoreNamedSceneSelection(
  set: NamedSceneSelection,
  targetRepresentationId: string,
  remaps: readonly ComponentRemap[],
): { selection: SceneSelection; notice: string | null } {
  if (set.selection.representationId === targetRepresentationId) {
    return { selection: set.selection, notice: null };
  }
  return transferSceneSelection(set.selection, targetRepresentationId, remaps);
}

export function filterSceneComponents(
  ids: readonly string[],
  filter: ComponentSelectionFilter,
  hidden: ReadonlySet<string>,
  sourceObjectId: string,
): readonly string[] {
  if (filter.sourceObjectId && filter.sourceObjectId !== sourceObjectId) return [];
  return ids.filter((id) => {
    const kind = id.split(":", 1)[0] as SceneSelection["kind"];
    return filter.kinds.includes(kind) && (filter.includeHidden || !hidden.has(id));
  });
}

export function growSceneComponents(ids: readonly string[], graph: SelectionGraph): readonly string[] {
  const grown = new Set(ids);
  for (const id of ids) for (const neighbor of graph.get(id) ?? []) grown.add(neighbor);
  return [...grown];
}

export function shrinkSceneComponents(ids: readonly string[], graph: SelectionGraph): readonly string[] {
  const selected = new Set(ids);
  return ids.filter((id) => (graph.get(id) ?? []).every((neighbor) => selected.has(neighbor)));
}

/** Region selection is independent of visibility; callers choose frontmost or
 * through-object candidates before applying a box or lasso polygon. */
export function selectScreenRegion<T extends { readonly id: string; readonly x: number; readonly y: number; readonly depth: number }>(
  candidates: readonly T[],
  polygon: readonly (readonly [number, number])[],
  mode: "frontmost" | "through" | "xray",
): readonly string[] {
  if (polygon.length < 3) return [];
  const contains = (x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inside = candidates.filter((item) => contains(item.x, item.y));
  if (mode !== "frontmost") return [...new Set(inside.map((item) => item.id))];
  const nearest = new Map<string, T>();
  for (const item of inside) {
    const key = `${Math.round(item.x / 4)}:${Math.round(item.y / 4)}`;
    if (!nearest.has(key) || item.depth < nearest.get(key)!.depth) nearest.set(key, item);
  }
  return [...new Set([...nearest.values()].map((item) => item.id))];
}
