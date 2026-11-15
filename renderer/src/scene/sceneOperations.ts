export type SceneOperation = {
  readonly id: string;
  readonly at: number;
  readonly workspace: "Geometry" | "Mesh";
  readonly objectId: string;
  readonly objectLabel: string;
  readonly componentLabel: string | null;
  readonly action: string;
  readonly parameters: string | null;
  readonly sourceRepresentation: string;
  readonly outputRepresentation: string;
  readonly revisionBefore: number | null;
  readonly revisionAfter: number | null;
  readonly beforeAvailable: boolean;
  readonly afterAvailable: boolean;
};

export type SceneOperationSource = Omit<SceneOperation, "id" | "workspace"> & {
  readonly id: string;
};

/** A single chronological view of commands from both editors. Stable IDs avoid
 * treating a representation switch as a new edit. */
export function mergeSceneOperations(
  geometry: readonly SceneOperationSource[],
  mesh: readonly SceneOperationSource[],
): readonly SceneOperation[] {
  const byId = new Map<string, SceneOperation>();
  for (const entry of geometry) byId.set(`geometry:${entry.id}`, { ...entry, id: `geometry:${entry.id}`, workspace: "Geometry" });
  for (const entry of mesh) byId.set(`mesh:${entry.id}`, { ...entry, id: `mesh:${entry.id}`, workspace: "Mesh" });
  return [...byId.values()].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

export function nextUndoableSceneOperation(
  operations: readonly SceneOperation[],
  undoneIds: ReadonlySet<string>,
): SceneOperation | null {
  return operations.find((operation) => !undoneIds.has(operation.id) && operation.beforeAvailable) ?? null;
}
