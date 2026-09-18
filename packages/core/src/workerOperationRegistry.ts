import type { WorkerRequest } from "./workerContracts";

/**
 * Stable mathematical operation IDs used by the backend-neutral execution
 * platform. They describe intent, never a transport or implementation detail.
 */
export type Math3DWorkerOperationId =
  | "mesh.import.obj"
  | "mesh.normals.compute"
  | "mesh.validation"
  | "mesh.repair"
  | "mesh.remesh"
  | "mesh.boolean"
  | "mesh.boolean.approximate"
  | "mesh.decimate"
  | "mesh.smooth"
  | "mesh.geodesic.heat"
  | "mesh.geodesic.shortest-path"
  | "surface.implicit.preview"
  | "surface.implicit.mesh"
  | "volume.slice"
  | "volume.contour"
  | "volume.distance-field"
  | "volume.streamlines"
  | "curve.analyze"
  | "symbolic.simplify"
  | "symbolic.solve"
  | "symbolic.factor";

export type WorkerOperationOwner =
  | "math3d-js"
  | "native-cgal"
  | "python-vtk"
  | "sage";

export type WorkerOperationMethod = "exact" | "numerical" | "algorithmic";
export type WorkerExecutionEnvironment = "browser" | "desktop" | "server" | "mobile";
export type LegacyWorkerRequestKind = WorkerRequest["kind"];

export type Math3DWorkerOperationDefinition = Readonly<{
  id: Math3DWorkerOperationId;
  title: string;
  canonicalOwner: WorkerOperationOwner;
  method: WorkerOperationMethod;
  environments: readonly WorkerExecutionEnvironment[];
  legacyRequestKinds: readonly LegacyWorkerRequestKind[];
}>;

const definitions = [
  {
    id: "mesh.import.obj",
    title: "OBJ import",
    canonicalOwner: "math3d-js",
    method: "algorithmic",
    environments: ["browser", "desktop", "server", "mobile"],
    legacyRequestKinds: [],
  },
  {
    id: "mesh.normals.compute",
    title: "Mesh normal computation",
    canonicalOwner: "math3d-js",
    method: "numerical",
    environments: ["browser", "desktop", "server", "mobile"],
    legacyRequestKinds: ["vtk.clean-normals"],
  },
  {
    id: "mesh.validation",
    title: "Mesh validation",
    canonicalOwner: "math3d-js",
    method: "algorithmic",
    environments: ["browser", "desktop", "server", "mobile"],
    legacyRequestKinds: ["cgal.validate"],
  },
  {
    id: "mesh.repair",
    title: "Mesh repair",
    canonicalOwner: "native-cgal",
    method: "algorithmic",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["cgal.repair"],
  },
  {
    id: "mesh.remesh",
    title: "Mesh remeshing",
    canonicalOwner: "native-cgal",
    method: "algorithmic",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["cgal.remesh"],
  },
  {
    id: "mesh.boolean",
    title: "Robust mesh boolean",
    canonicalOwner: "native-cgal",
    method: "exact",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["cgal.boolean"],
  },
  {
    id: "mesh.boolean.approximate",
    title: "Approximate mesh boolean",
    canonicalOwner: "python-vtk",
    method: "numerical",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.boolean"],
  },
  {
    id: "mesh.decimate",
    title: "Mesh decimation",
    canonicalOwner: "python-vtk",
    method: "algorithmic",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.decimate"],
  },
  {
    id: "mesh.smooth",
    title: "Mesh smoothing",
    canonicalOwner: "python-vtk",
    method: "numerical",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.smooth"],
  },
  {
    id: "mesh.geodesic.heat",
    title: "Heat-method geodesic",
    canonicalOwner: "math3d-js",
    method: "numerical",
    environments: ["browser", "desktop", "server", "mobile"],
    legacyRequestKinds: ["cgal.geodesic-heat"],
  },
  {
    id: "mesh.geodesic.shortest-path",
    title: "Surface shortest path",
    canonicalOwner: "native-cgal",
    method: "exact",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["cgal.geodesic-surface-path"],
  },
  {
    id: "surface.implicit.preview",
    title: "Implicit surface preview",
    canonicalOwner: "python-vtk",
    method: "numerical",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.preview-implicit"],
  },
  {
    id: "surface.implicit.mesh",
    title: "Implicit surface meshing",
    canonicalOwner: "native-cgal",
    method: "algorithmic",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["cgal.mesh"],
  },
  {
    id: "volume.slice",
    title: "Volume slice",
    canonicalOwner: "python-vtk",
    method: "numerical",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.volume.slice"],
  },
  {
    id: "volume.contour",
    title: "Volume isosurface",
    canonicalOwner: "python-vtk",
    method: "algorithmic",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.volume.isosurface"],
  },
  {
    id: "volume.distance-field",
    title: "Volume distance field",
    canonicalOwner: "python-vtk",
    method: "numerical",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.volume.distance"],
  },
  {
    id: "volume.streamlines",
    title: "Volume streamlines",
    canonicalOwner: "python-vtk",
    method: "numerical",
    environments: ["desktop", "server"],
    legacyRequestKinds: ["vtk.volume.streamlines"],
  },
  {
    id: "curve.analyze",
    title: "Curve analysis",
    canonicalOwner: "math3d-js",
    method: "numerical",
    environments: ["browser", "desktop", "server", "mobile"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.simplify",
    title: "Symbolic simplification",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.solve",
    title: "Symbolic solve",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.factor",
    title: "Symbolic factorization",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["server"],
    legacyRequestKinds: [],
  },
] as const satisfies readonly Math3DWorkerOperationDefinition[];

const freezeDefinition = (definition: Math3DWorkerOperationDefinition): Math3DWorkerOperationDefinition =>
  Object.freeze({
    ...definition,
    environments: Object.freeze([...definition.environments]),
    legacyRequestKinds: Object.freeze([...definition.legacyRequestKinds]),
  });

const registry = definitions.map(freezeDefinition).sort((left, right) => left.id.localeCompare(right.id));
const operationById = new Map<Math3DWorkerOperationId, Math3DWorkerOperationDefinition>();
const operationByLegacyKind = new Map<LegacyWorkerRequestKind, Math3DWorkerOperationDefinition>();

for (const definition of registry) {
  if (operationById.has(definition.id)) throw new TypeError(`Duplicate worker operation '${definition.id}'.`);
  operationById.set(definition.id, definition);
  for (const legacyKind of definition.legacyRequestKinds) {
    if (operationByLegacyKind.has(legacyKind)) {
      throw new TypeError(`Legacy worker request '${legacyKind}' is mapped more than once.`);
    }
    operationByLegacyKind.set(legacyKind, definition);
  }
}

export const MATH3D_WORKER_OPERATION_REGISTRY = Object.freeze(registry);

export const isMath3DWorkerOperationId = (value: string): value is Math3DWorkerOperationId =>
  operationById.has(value as Math3DWorkerOperationId);

export const getMath3DWorkerOperation = (
  id: string
): Math3DWorkerOperationDefinition | null => operationById.get(id as Math3DWorkerOperationId) ?? null;

export const getMath3DWorkerOperationForLegacyRequest = (
  kind: LegacyWorkerRequestKind
): Math3DWorkerOperationDefinition | null => operationByLegacyKind.get(kind) ?? null;
