import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  makeGeometryEdgeKey,
  summarizeGeometryEdgeTopology,
  summarizeGeometryFaceTopology,
  summarizeGeometryVertexTopology,
  type GeometryPickResult,
  type GeometryTopologyReference,
} from "../geometry/picking";

export type UnifiedSelectionWorkspace = "geometry" | "mesh";
export type UnifiedSelectionKind = "object" | "face" | "edge" | "vertex";
export type UnifiedSelectionLifecycle = "selected" | "hover" | "editing" | "preview";
export type UnifiedSelectionVec3 = readonly [number, number, number];

export type UnifiedSelectionTopology = {
  readonly adjacentFaces: readonly number[];
  readonly adjacentEdges: readonly string[];
  readonly adjacentVertices: readonly number[];
  readonly incidentFaces?: number;
  readonly incidentEdges?: number;
  readonly valence?: number;
  readonly boundaryEdges?: number;
  readonly boundary?: boolean;
  readonly nonManifold?: boolean;
  readonly faceVertexCount?: number;
};

export type SelectionResultAdjacency = {
  readonly faces: readonly number[];
  readonly edges: readonly string[];
  readonly vertices: readonly number[];
  readonly incidentFaces?: number;
  readonly incidentEdges?: number;
  readonly valence?: number;
};

export type SelectionResultTopologyFlags = {
  readonly hasTopology: boolean;
  readonly boundary: boolean;
  readonly nonManifold: boolean;
  readonly stale: boolean;
  readonly boundaryEdges?: number;
  readonly faceVertexCount?: number;
  readonly topologyVersion?: number | null;
};

export type SelectionResult = {
  readonly workspace: UnifiedSelectionWorkspace;
  readonly objectId: string;
  readonly objectLabel: string;
  readonly objectType?: string | null;
  readonly entityType: UnifiedSelectionKind;
  readonly entityId: string;
  readonly point: UnifiedSelectionVec3 | null;
  readonly normal: UnifiedSelectionVec3 | null;
  readonly adjacency: SelectionResultAdjacency;
  readonly topologyFlags: SelectionResultTopologyFlags;
  readonly state: UnifiedSelectionLifecycle;
  readonly meshKey?: string | null;
  readonly topologyVersion?: number | null;
  readonly stale: boolean;
  readonly label: string;
};

export type UnifiedSelectionManagerState = {
  readonly selected: SelectionResult | null;
  readonly hover: SelectionResult | null;
  readonly editing: SelectionResult | null;
  readonly preview: SelectionResult | null;
  readonly active: SelectionResult | null;
  readonly results: readonly SelectionResult[];
  readonly byEntityId: Readonly<Record<string, SelectionResult>>;
  readonly label: string;
};

export type UnifiedSelection = SelectionResult & {
  readonly selectionType: UnifiedSelectionKind;
  readonly lifecycle: UnifiedSelectionLifecycle;
  readonly topologyReference?: GeometryTopologyReference | null;
  readonly faceId?: number | null;
  readonly edgeId?: string | null;
  readonly edgeVertices?: readonly [number, number] | null;
  readonly vertexId?: number | null;
  readonly worldPosition?: UnifiedSelectionVec3 | null;
  readonly localPosition?: UnifiedSelectionVec3 | null;
  readonly normal?: UnifiedSelectionVec3 | null;
  readonly tangent?: UnifiedSelectionVec3 | null;
  readonly bitangent?: UnifiedSelectionVec3 | null;
  readonly topology: UnifiedSelectionTopology;
  readonly source: "geometry-pick" | "mesh-topology" | "mesh-object";
};

export type UnifiedSelectionEntityId = string;
export type UnifiedSelectionKey = string;

export type UnifiedSelectionDomain = {
  readonly workspace: UnifiedSelectionWorkspace;
  readonly selectionType: UnifiedSelectionKind;
  readonly objectId: string;
  readonly objectLabel: string;
  readonly objectType?: string | null;
  readonly meshKey?: string | null;
  readonly topologyVersion?: number | null;
};

export type UnifiedSelectionCounts = Readonly<Record<UnifiedSelectionKind, number>>;

export type UnifiedSelectionSet = {
  readonly domain: UnifiedSelectionDomain | null;
  readonly items: readonly UnifiedSelection[];
  readonly keys: readonly UnifiedSelectionKey[];
  readonly count: number;
  readonly counts: UnifiedSelectionCounts;
  readonly activeKey: UnifiedSelectionKey | null;
  readonly anchorKey: UnifiedSelectionKey | null;
  readonly activeSelection: UnifiedSelection | null;
  readonly anchorSelection: UnifiedSelection | null;
  readonly empty: boolean;
  readonly label: string;
};

export type UnifiedSelectionSetEditMode = "replace" | "add" | "toggle" | "remove" | "clear";

export type MeshTopologyUnifiedSelectionMode = "object" | "face" | "edge" | "vertex";

export type UnifiedSelectionTopologyFilterMode = "any" | "only" | "exclude";

export type UnifiedSelectionFilter = {
  readonly workspaces?: readonly UnifiedSelectionWorkspace[];
  readonly selectionTypes?: readonly UnifiedSelectionKind[];
  readonly lifecycles?: readonly UnifiedSelectionLifecycle[];
  readonly stale?: "include" | "exclude" | "only";
  readonly boundary?: UnifiedSelectionTopologyFilterMode;
  readonly nonManifold?: UnifiedSelectionTopologyFilterMode;
};

export type UnifiedSelectionFilterResult = {
  readonly accepted: boolean;
  readonly reasons: readonly string[];
};

export type MeshTopologyUnifiedSelectionInput = {
  readonly objectId?: string | null;
  readonly objectLabel?: string | null;
  readonly objectType?: string | null;
  readonly meshKey?: string | null;
  readonly topologyVersion?: number | null;
  readonly mesh?: SurfaceMeshData | null;
  readonly mode: MeshTopologyUnifiedSelectionMode;
  readonly faceIndex?: number | null;
  readonly edgeVertices?: readonly [number, number] | null;
  readonly vertexIndex?: number | null;
  readonly valid?: boolean;
  readonly selectionCleared?: boolean;
  readonly worldPosition?: UnifiedSelectionVec3 | null;
  readonly normal?: UnifiedSelectionVec3 | null;
};

const EMPTY_TOPOLOGY: UnifiedSelectionTopology = {
  adjacentFaces: [],
  adjacentEdges: [],
  adjacentVertices: [],
};

const EMPTY_SELECTION_COUNTS: UnifiedSelectionCounts = {
  object: 0,
  face: 0,
  edge: 0,
  vertex: 0,
};

const EMPTY_SELECTION_SET: UnifiedSelectionSet = {
  domain: null,
  items: [],
  keys: [],
  count: 0,
  counts: EMPTY_SELECTION_COUNTS,
  activeKey: null,
  anchorKey: null,
  activeSelection: null,
  anchorSelection: null,
  empty: true,
  label: "No selection",
};

const EMPTY_SELECTION_MANAGER_STATE: UnifiedSelectionManagerState = {
  selected: null,
  hover: null,
  editing: null,
  preview: null,
  active: null,
  results: [],
  byEntityId: {},
  label: "No selection",
};

const toVec3 = (value: readonly [number, number, number] | undefined | null): UnifiedSelectionVec3 | null =>
  value ? [value[0], value[1], value[2]] : null;

const formatMeshObjectLabel = (input: MeshTopologyUnifiedSelectionInput): string => {
  const label = input.objectLabel?.trim();
  return label || input.mesh?.label || "SurfaceMesh";
};

const formatSelectionLabel = (kind: UnifiedSelectionKind, objectLabel: string, id?: string | number | null): string => {
  if (kind === "object") return `${objectLabel} object`;
  if (kind === "edge") return id == null ? `${objectLabel} edge` : `${objectLabel} edge [${id}]`;
  return id == null ? `${objectLabel} ${kind}` : `${objectLabel} ${kind} #${id}`;
};

const edgeIdFromVertices = (vertices: readonly [number, number] | null | undefined): string | null =>
  vertices ? `${vertices[0]}-${vertices[1]}` : null;

const buildSelectionEntityId = (
  kind: UnifiedSelectionKind,
  objectId: string,
  ids: {
    readonly faceId?: number | null;
    readonly edgeId?: string | null;
    readonly vertexId?: number | null;
  } = {}
): string => {
  if (kind === "object") return `object:${objectId}`;
  if (kind === "face") return `face:${ids.faceId ?? ""}`;
  if (kind === "edge") return `edge:${ids.edgeId ?? ""}`;
  return `vertex:${ids.vertexId ?? ""}`;
};

const topologyTouchesBoundary = (topology: UnifiedSelectionTopology): boolean =>
  topology.boundary === true || (topology.boundaryEdges ?? 0) > 0;

const topologyIsNonManifold = (topology: UnifiedSelectionTopology): boolean => topology.nonManifold === true;

const topologyHasDetails = (topology: UnifiedSelectionTopology): boolean =>
  topology.adjacentFaces.length > 0 ||
  topology.adjacentEdges.length > 0 ||
  topology.adjacentVertices.length > 0 ||
  topology.incidentFaces != null ||
  topology.incidentEdges != null ||
  topology.valence != null ||
  topology.boundaryEdges != null ||
  topology.boundary != null ||
  topology.nonManifold != null ||
  topology.faceVertexCount != null;

const buildSelectionResultFields = (input: {
  readonly workspace: UnifiedSelectionWorkspace;
  readonly kind: UnifiedSelectionKind;
  readonly lifecycle: UnifiedSelectionLifecycle;
  readonly objectId: string;
  readonly objectLabel: string;
  readonly objectType?: string | null;
  readonly meshKey?: string | null;
  readonly topologyVersion?: number | null;
  readonly stale: boolean;
  readonly label: string;
  readonly faceId?: number | null;
  readonly edgeId?: string | null;
  readonly vertexId?: number | null;
  readonly worldPosition?: UnifiedSelectionVec3 | null;
  readonly normal?: UnifiedSelectionVec3 | null;
  readonly topology: UnifiedSelectionTopology;
}): SelectionResult => ({
  workspace: input.workspace,
  objectId: input.objectId,
  objectLabel: input.objectLabel,
  objectType: input.objectType ?? null,
  entityType: input.kind,
  entityId: buildSelectionEntityId(input.kind, input.objectId, {
    faceId: input.faceId,
    edgeId: input.edgeId,
    vertexId: input.vertexId,
  }),
  point: input.worldPosition ?? null,
  normal: input.normal ?? null,
  adjacency: {
    faces: input.topology.adjacentFaces,
    edges: input.topology.adjacentEdges,
    vertices: input.topology.adjacentVertices,
    incidentFaces: input.topology.incidentFaces,
    incidentEdges: input.topology.incidentEdges,
    valence: input.topology.valence,
  },
  topologyFlags: {
    hasTopology: topologyHasDetails(input.topology),
    boundary: topologyTouchesBoundary(input.topology),
    nonManifold: topologyIsNonManifold(input.topology),
    stale: input.stale,
    boundaryEdges: input.topology.boundaryEdges,
    faceVertexCount: input.topology.faceVertexCount,
    topologyVersion: input.topologyVersion ?? null,
  },
  state: input.lifecycle,
  meshKey: input.meshKey ?? null,
  topologyVersion: input.topologyVersion ?? null,
  stale: input.stale,
  label: input.label,
});

const encodeKeyPart = (value: string | number | null | undefined): string =>
  encodeURIComponent(value == null ? "" : String(value));

const pluralSelectionKind = (kind: UnifiedSelectionKind, count: number): string =>
  count === 1 ? kind : kind === "vertex" ? "vertices" : `${kind}s`;

export function getUnifiedSelectionEntityId(selection: UnifiedSelection): UnifiedSelectionEntityId | null {
  if (selection.entityId) return selection.entityId;
  if (selection.selectionType === "object") return `object:${selection.objectId}`;
  if (selection.selectionType === "face") {
    return selection.faceId == null ? null : `face:${selection.faceId}`;
  }
  if (selection.selectionType === "edge") {
    const edgeId = selection.edgeId ?? edgeIdFromVertices(selection.edgeVertices);
    return edgeId ? `edge:${edgeId}` : null;
  }
  return selection.vertexId == null ? null : `vertex:${selection.vertexId}`;
}

export function getUnifiedSelectionKey(selection: UnifiedSelection): UnifiedSelectionKey | null {
  const entityId = getUnifiedSelectionEntityId(selection);
  if (!entityId) return null;
  return [
    selection.workspace,
    selection.objectId,
    selection.meshKey ?? "",
    selection.topologyVersion ?? "",
    selection.selectionType,
    entityId,
  ]
    .map(encodeKeyPart)
    .join("|");
}

export function getUnifiedSelectionDomain(selection: UnifiedSelection): UnifiedSelectionDomain {
  return {
    workspace: selection.workspace,
    selectionType: selection.selectionType,
    objectId: selection.objectId,
    objectLabel: selection.objectLabel,
    objectType: selection.objectType ?? null,
    meshKey: selection.meshKey ?? null,
    topologyVersion: selection.topologyVersion ?? null,
  };
}

export function areUnifiedSelectionDomainsEqual(
  a: UnifiedSelectionDomain | null | undefined,
  b: UnifiedSelectionDomain | null | undefined
): boolean {
  if (!a || !b) return false;
  return (
    a.workspace === b.workspace &&
    a.selectionType === b.selectionType &&
    a.objectId === b.objectId &&
    (a.meshKey ?? null) === (b.meshKey ?? null) &&
    (a.topologyVersion ?? null) === (b.topologyVersion ?? null)
  );
}

export function areUnifiedSelectionsInSameSetDomain(a: UnifiedSelection, b: UnifiedSelection): boolean {
  return areUnifiedSelectionDomainsEqual(getUnifiedSelectionDomain(a), getUnifiedSelectionDomain(b));
}

const selectionTouchesBoundary = (selection: UnifiedSelection): boolean =>
  selection.topologyFlags.boundary || topologyTouchesBoundary(selection.topology);

const selectionIsNonManifold = (selection: UnifiedSelection): boolean =>
  selection.topologyFlags.nonManifold || topologyIsNonManifold(selection.topology);

const matchTopologyMode = (value: boolean, mode: UnifiedSelectionTopologyFilterMode | undefined): boolean => {
  if (!mode || mode === "any") return true;
  return mode === "only" ? value : !value;
};

export function evaluateUnifiedSelectionFilter(
  selection: UnifiedSelection | null | undefined,
  filter: UnifiedSelectionFilter | null | undefined
): UnifiedSelectionFilterResult {
  if (!selection) return { accepted: false, reasons: ["No selection"] };
  if (!filter) return { accepted: true, reasons: [] };

  const reasons: string[] = [];
  if (filter.workspaces?.length && !filter.workspaces.includes(selection.workspace)) {
    reasons.push(`Workspace ${selection.workspace} is filtered out`);
  }
  if (filter.selectionTypes?.length && !filter.selectionTypes.includes(selection.selectionType)) {
    reasons.push(`${selection.selectionType} selections are filtered out`);
  }
  if (filter.lifecycles?.length && !filter.lifecycles.includes(selection.lifecycle)) {
    reasons.push(`${selection.lifecycle} selections are filtered out`);
  }
  if (filter.stale === "exclude" && selection.stale) {
    reasons.push("Stale selections are filtered out");
  } else if (filter.stale === "only" && !selection.stale) {
    reasons.push("Only stale selections are enabled");
  }
  if (!matchTopologyMode(selectionTouchesBoundary(selection), filter.boundary)) {
    reasons.push(filter.boundary === "only" ? "Only boundary selections are enabled" : "Boundary selections are filtered out");
  }
  if (!matchTopologyMode(selectionIsNonManifold(selection), filter.nonManifold)) {
    reasons.push(
      filter.nonManifold === "only"
        ? "Only non-manifold selections are enabled"
        : "Non-manifold selections are filtered out"
    );
  }

  return { accepted: reasons.length === 0, reasons };
}

export function unifiedSelectionMatchesFilter(
  selection: UnifiedSelection | null | undefined,
  filter: UnifiedSelectionFilter | null | undefined
): boolean {
  return evaluateUnifiedSelectionFilter(selection, filter).accepted;
}

export function filterUnifiedSelections(
  selections: readonly (UnifiedSelection | null | undefined)[],
  filter: UnifiedSelectionFilter | null | undefined
): UnifiedSelection[] {
  return selections.filter((selection): selection is UnifiedSelection => unifiedSelectionMatchesFilter(selection, filter));
}

export function filterUnifiedSelectionSet(
  set: UnifiedSelectionSet,
  filter: UnifiedSelectionFilter | null | undefined
): UnifiedSelectionSet {
  if (!filter || set.empty) return set;
  return createUnifiedSelectionSet(filterUnifiedSelections(set.items, filter), {
    activeKey: set.activeKey,
    anchorKey: set.anchorKey,
  });
}

export function describeUnifiedSelectionFilter(filter: UnifiedSelectionFilter | null | undefined): string {
  if (!filter) return "All selections";
  const parts: string[] = [];
  if (filter.workspaces?.length) parts.push(`workspace: ${filter.workspaces.join(", ")}`);
  if (filter.selectionTypes?.length) parts.push(`types: ${filter.selectionTypes.join(", ")}`);
  if (filter.lifecycles?.length) parts.push(`state: ${filter.lifecycles.join(", ")}`);
  if (filter.stale === "exclude") parts.push("fresh only");
  if (filter.stale === "only") parts.push("stale only");
  if (filter.boundary === "only") parts.push("boundary only");
  if (filter.boundary === "exclude") parts.push("interior only");
  if (filter.nonManifold === "only") parts.push("non-manifold only");
  if (filter.nonManifold === "exclude") parts.push("manifold only");
  return parts.length ? parts.join(" · ") : "All selections";
}

export function createUnifiedSelectionManagerState(
  selections: readonly (SelectionResult | UnifiedSelection | null | undefined)[]
): UnifiedSelectionManagerState {
  const results = selections.filter((selection): selection is SelectionResult => !!selection);
  if (!results.length) return EMPTY_SELECTION_MANAGER_STATE;
  const byEntityId: Record<string, SelectionResult> = {};
  let selected: SelectionResult | null = null;
  let hover: SelectionResult | null = null;
  let editing: SelectionResult | null = null;
  let preview: SelectionResult | null = null;
  for (const result of results) {
    byEntityId[result.entityId] = result;
    if (result.state === "selected") selected = result;
    else if (result.state === "hover") hover = result;
    else if (result.state === "editing") editing = result;
    else if (result.state === "preview") preview = result;
  }
  const active = editing ?? selected ?? hover ?? preview ?? results[results.length - 1] ?? null;
  return {
    selected,
    hover,
    editing,
    preview,
    active,
    results,
    byEntityId,
    label: active?.label ?? "No selection",
  };
}

const findSelectionByKey = (
  items: readonly UnifiedSelection[],
  keys: readonly UnifiedSelectionKey[],
  key: UnifiedSelectionKey | null | undefined
): UnifiedSelection | null => {
  if (!key) return null;
  const index = keys.indexOf(key);
  return index >= 0 ? items[index] ?? null : null;
};

export function createUnifiedSelectionSet(
  selections: readonly (UnifiedSelection | null | undefined)[],
  options: { activeKey?: UnifiedSelectionKey | null; anchorKey?: UnifiedSelectionKey | null } = {}
): UnifiedSelectionSet {
  let domain: UnifiedSelectionDomain | null = null;
  const items: UnifiedSelection[] = [];
  const keys: UnifiedSelectionKey[] = [];

  for (const selection of selections) {
    if (!selection) continue;
    const key = getUnifiedSelectionKey(selection);
    if (!key) continue;
    const selectionDomain = getUnifiedSelectionDomain(selection);
    if (!domain) domain = selectionDomain;
    if (!areUnifiedSelectionDomainsEqual(domain, selectionDomain)) continue;
    const existingIndex = keys.indexOf(key);
    if (existingIndex >= 0) {
      items[existingIndex] = selection;
    } else {
      keys.push(key);
      items.push(selection);
    }
  }

  if (!domain || !items.length) return EMPTY_SELECTION_SET;

  const counts: Record<UnifiedSelectionKind, number> = { ...EMPTY_SELECTION_COUNTS };
  items.forEach((item) => {
    counts[item.selectionType] += 1;
  });
  const activeKey = options.activeKey && keys.includes(options.activeKey) ? options.activeKey : keys[keys.length - 1] ?? null;
  const anchorKey = options.anchorKey && keys.includes(options.anchorKey) ? options.anchorKey : keys[0] ?? null;
  const activeSelection = findSelectionByKey(items, keys, activeKey);
  const anchorSelection = findSelectionByKey(items, keys, anchorKey);
  const label =
    items.length === 1
      ? items[0].label
      : `${items.length} ${pluralSelectionKind(domain.selectionType, items.length)} selected on ${domain.objectLabel}`;

  return {
    domain,
    items,
    keys,
    count: items.length,
    counts,
    activeKey,
    anchorKey,
    activeSelection,
    anchorSelection,
    empty: false,
    label,
  };
}

export function updateUnifiedSelectionSet(
  previous: UnifiedSelectionSet,
  selection: UnifiedSelection | null | undefined,
  mode: UnifiedSelectionSetEditMode
): UnifiedSelectionSet {
  if (mode === "clear") return EMPTY_SELECTION_SET;
  if (!selection) return mode === "replace" ? EMPTY_SELECTION_SET : previous;

  const key = getUnifiedSelectionKey(selection);
  if (!key) return previous;
  const selectionDomain = getUnifiedSelectionDomain(selection);
  if (mode === "replace") {
    return createUnifiedSelectionSet([selection], { activeKey: key, anchorKey: key });
  }
  if (!previous.domain || !areUnifiedSelectionDomainsEqual(previous.domain, selectionDomain)) {
    return mode === "remove" ? previous : createUnifiedSelectionSet([selection], { activeKey: key, anchorKey: key });
  }

  const index = previous.keys.indexOf(key);
  if (mode === "remove") {
    if (index < 0) return previous;
    const nextItems = previous.items.filter((_item, itemIndex) => itemIndex !== index);
    return createUnifiedSelectionSet(nextItems, {
      activeKey: previous.activeKey === key ? undefined : previous.activeKey,
      anchorKey: previous.anchorKey === key ? undefined : previous.anchorKey,
    });
  }
  if (mode === "toggle" && index >= 0) {
    const nextItems = previous.items.filter((_item, itemIndex) => itemIndex !== index);
    return createUnifiedSelectionSet(nextItems, {
      activeKey: previous.activeKey === key ? undefined : previous.activeKey,
      anchorKey: previous.anchorKey === key ? undefined : previous.anchorKey,
    });
  }

  const nextItems = [...previous.items];
  if (index >= 0) nextItems[index] = selection;
  else nextItems.push(selection);
  return createUnifiedSelectionSet(nextItems, {
    activeKey: key,
    anchorKey: previous.anchorKey ?? key,
  });
}

const readMeshVertex = (mesh: SurfaceMeshData | null, index: number | null): UnifiedSelectionVec3 | null => {
  if (!mesh || index == null) return null;
  const vertexCount = Math.floor((mesh.positions?.length ?? 0) / 3);
  if (!Number.isInteger(index) || index < 0 || index >= vertexCount) return null;
  const base = index * 3;
  return [Number(mesh.positions[base]), Number(mesh.positions[base + 1]), Number(mesh.positions[base + 2])];
};

const readMeshFaceVertexIndices = (
  mesh: SurfaceMeshData | null,
  faceIndex: number | null
): readonly [number, number, number] | null => {
  if (!mesh || faceIndex == null) return null;
  const vertexCount = Math.floor((mesh.positions?.length ?? 0) / 3);
  const indices = mesh.indices ?? null;
  const faceCount = indices && indices.length >= 3 ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= faceCount) return null;
  const base = faceIndex * 3;
  const a = indices ? Number(indices[base]) : base;
  const b = indices ? Number(indices[base + 1]) : base + 1;
  const c = indices ? Number(indices[base + 2]) : base + 2;
  if (a < 0 || b < 0 || c < 0 || a >= vertexCount || b >= vertexCount || c >= vertexCount) return null;
  return [a, b, c];
};

const averagePoints = (points: readonly UnifiedSelectionVec3[]): UnifiedSelectionVec3 | null => {
  if (!points.length) return null;
  const sum = points.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]] as [number, number, number],
    [0, 0, 0] as [number, number, number]
  );
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
};

const faceAdjacentEdges = (pick: GeometryPickResult): string[] => {
  const tri = pick.sourceTriangle;
  if (!tri) return [];
  return [
    makeGeometryEdgeKey(tri[0], tri[1]),
    makeGeometryEdgeKey(tri[1], tri[2]),
    makeGeometryEdgeKey(tri[2], tri[0]),
  ];
};

export function unifiedSelectionFromGeometryPick(
  pick: GeometryPickResult | null | undefined,
  lifecycle: UnifiedSelectionLifecycle = "selected"
): UnifiedSelection | null {
  if (!pick) return null;
  const edgeId = edgeIdFromVertices(pick.edgeVertices);
  const topology: UnifiedSelectionTopology =
    pick.kind === "face"
      ? {
          adjacentFaces: pick.faceTopology?.adjacentFaceIndices ?? [],
          adjacentEdges: faceAdjacentEdges(pick),
          adjacentVertices: pick.sourceTriangle ?? [],
          faceVertexCount: pick.faceTopology?.vertices,
        }
      : pick.kind === "edge"
        ? {
            adjacentFaces: pick.edgeTopology?.adjacentFaces ?? [],
            adjacentEdges: [],
            adjacentVertices: pick.edgeVertices ?? [],
            incidentFaces: pick.edgeTopology?.incidentFaces,
            boundary: pick.edgeTopology?.boundary,
            nonManifold: pick.edgeTopology?.nonManifold,
          }
        : pick.kind === "vertex"
          ? {
              adjacentFaces: pick.vertexTopology?.faceIndices ?? [],
              adjacentEdges: [],
              adjacentVertices: pick.vertexTopology?.neighborVertices ?? [],
              incidentFaces: pick.vertexTopology?.incidentFaces,
              incidentEdges: pick.vertexTopology?.incidentEdges,
              valence: pick.vertexTopology?.valence,
              boundaryEdges: pick.vertexTopology?.boundaryEdges,
            }
          : EMPTY_TOPOLOGY;
  const worldPosition = toVec3(pick.worldPoint);
  const normal = toVec3(pick.normal);
  const resultFields = buildSelectionResultFields({
    workspace: "geometry",
    kind: pick.kind,
    lifecycle,
    objectId: pick.objectId,
    objectLabel: pick.objectLabel,
    objectType: pick.objectType,
    meshKey: pick.meshKey ?? null,
    topologyVersion: pick.topologyVersion ?? null,
    stale: Boolean(pick.stale),
    label: pick.label,
    faceId: pick.faceIndex ?? null,
    edgeId,
    vertexId: pick.vertexIndex ?? null,
    worldPosition,
    normal,
    topology,
  });

  return {
    ...resultFields,
    selectionType: pick.kind,
    lifecycle,
    topologyReference: pick.topologyReference ?? null,
    faceId: pick.faceIndex ?? null,
    edgeId,
    edgeVertices: pick.edgeVertices ?? null,
    vertexId: pick.vertexIndex ?? null,
    worldPosition,
    localPosition: toVec3(pick.localPoint),
    normal,
    tangent: toVec3(pick.tangent),
    bitangent: toVec3(pick.bitangent),
    topology,
    source: "geometry-pick",
  };
}

export function unifiedSelectionFromMeshTopology(
  input: MeshTopologyUnifiedSelectionInput,
  lifecycle: UnifiedSelectionLifecycle = "selected"
): UnifiedSelection | null {
  if (input.selectionCleared || input.valid === false) return null;
  const objectLabel = formatMeshObjectLabel(input);
  const objectId = input.objectId ?? input.meshKey ?? objectLabel;
  const meshKey = input.meshKey ?? objectId;
  const mode = input.mode;

  if (mode === "object") {
    if (!input.mesh && !input.objectLabel && !input.objectId) return null;
    const label = formatSelectionLabel("object", objectLabel);
    const worldPosition = input.worldPosition ?? null;
    const normal = input.normal ?? null;
    const resultFields = buildSelectionResultFields({
      workspace: "mesh",
      kind: "object",
      lifecycle,
      objectId,
      objectLabel,
      objectType: input.objectType ?? "mesh",
      meshKey,
      topologyVersion: input.topologyVersion ?? null,
      stale: false,
      label,
      worldPosition,
      normal,
      topology: EMPTY_TOPOLOGY,
    });
    return {
      ...resultFields,
      selectionType: "object",
      lifecycle,
      topologyReference: null,
      faceId: null,
      edgeId: null,
      edgeVertices: null,
      vertexId: null,
      worldPosition,
      normal: input.normal ?? null,
      tangent: null,
      bitangent: null,
      topology: EMPTY_TOPOLOGY,
      source: "mesh-object",
    };
  }

  const faceId = input.faceIndex ?? null;
  const edgeVertices = input.edgeVertices ?? null;
  const edgeId = edgeIdFromVertices(edgeVertices);
  const vertexId = input.vertexIndex ?? null;
  const mesh = input.mesh ?? null;
  const faceVertexIndices = mode === "face" ? readMeshFaceVertexIndices(mesh, faceId) : null;
  const faceTopology = mesh && faceId != null ? summarizeGeometryFaceTopology(mesh, faceId) : undefined;
  const edgeTopology = mesh && edgeVertices ? summarizeGeometryEdgeTopology(mesh, [...edgeVertices] as [number, number]) : undefined;
  const vertexTopology = mesh && vertexId != null ? summarizeGeometryVertexTopology(mesh, vertexId) : undefined;
  const derivedWorldPosition =
    input.worldPosition ??
    (mode === "face" && faceVertexIndices
      ? averagePoints(faceVertexIndices.map((index) => readMeshVertex(mesh, index)).filter((point): point is UnifiedSelectionVec3 => !!point))
      : mode === "edge" && edgeVertices
        ? averagePoints(edgeVertices.map((index) => readMeshVertex(mesh, index)).filter((point): point is UnifiedSelectionVec3 => !!point))
        : mode === "vertex"
          ? readMeshVertex(mesh, vertexId)
          : null);
  const topology: UnifiedSelectionTopology =
    mode === "face"
      ? {
          adjacentFaces: faceTopology?.adjacentFaceIndices ?? [],
          adjacentEdges: faceVertexIndices
            ? [
                makeGeometryEdgeKey(faceVertexIndices[0], faceVertexIndices[1]),
                makeGeometryEdgeKey(faceVertexIndices[1], faceVertexIndices[2]),
                makeGeometryEdgeKey(faceVertexIndices[2], faceVertexIndices[0]),
              ]
            : [],
          adjacentVertices: faceVertexIndices ?? [],
          faceVertexCount: faceTopology?.vertices,
        }
      : mode === "edge"
        ? {
            adjacentFaces: edgeTopology?.adjacentFaces ?? [],
            adjacentEdges: [],
            adjacentVertices: edgeVertices ?? [],
            incidentFaces: edgeTopology?.incidentFaces,
            boundary: edgeTopology?.boundary,
            nonManifold: edgeTopology?.nonManifold,
          }
        : {
            adjacentFaces: vertexTopology?.faceIndices ?? [],
            adjacentEdges: [],
            adjacentVertices: vertexTopology?.neighborVertices ?? [],
            incidentFaces: vertexTopology?.incidentFaces,
            incidentEdges: vertexTopology?.incidentEdges,
            valence: vertexTopology?.valence,
            boundaryEdges: vertexTopology?.boundaryEdges,
          };

  const entityId = mode === "face" ? faceId : mode === "edge" ? edgeId : vertexId;
  const label = formatSelectionLabel(mode, objectLabel, entityId);
  const normal = input.normal ?? null;
  const resultFields = buildSelectionResultFields({
    workspace: "mesh",
    kind: mode,
    lifecycle,
    objectId,
    objectLabel,
    objectType: input.objectType ?? "mesh",
    meshKey,
    topologyVersion: input.topologyVersion ?? null,
    stale: false,
    label,
    faceId,
    edgeId,
    vertexId,
    worldPosition: derivedWorldPosition,
    normal,
    topology,
  });
  return {
    ...resultFields,
    selectionType: mode,
    lifecycle,
    topologyReference: null,
    faceId,
    edgeId,
    edgeVertices,
    vertexId,
    worldPosition: derivedWorldPosition,
    localPosition: null,
    normal,
    tangent: null,
    bitangent: null,
    topology,
    source: "mesh-topology",
  };
}

export function selectionResultFromUnifiedSelection(
  selection: UnifiedSelection | null | undefined
): SelectionResult | null {
  if (!selection) return null;
  return {
    workspace: selection.workspace,
    objectId: selection.objectId,
    objectLabel: selection.objectLabel,
    objectType: selection.objectType ?? null,
    entityType: selection.entityType,
    entityId: selection.entityId,
    point: selection.point,
    normal: selection.normal,
    adjacency: selection.adjacency,
    topologyFlags: selection.topologyFlags,
    state: selection.state,
    meshKey: selection.meshKey ?? null,
    topologyVersion: selection.topologyVersion ?? null,
    stale: selection.stale,
    label: selection.label,
  };
}

export function selectionResultFromGeometryPick(
  pick: GeometryPickResult | null | undefined,
  lifecycle: UnifiedSelectionLifecycle = "selected"
): SelectionResult | null {
  return selectionResultFromUnifiedSelection(unifiedSelectionFromGeometryPick(pick, lifecycle));
}

export function selectionResultFromMeshTopology(
  input: MeshTopologyUnifiedSelectionInput,
  lifecycle: UnifiedSelectionLifecycle = "selected"
): SelectionResult | null {
  return selectionResultFromUnifiedSelection(unifiedSelectionFromMeshTopology(input, lifecycle));
}
