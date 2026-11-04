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
  | "mesh.analyze.differential"
  | "surface.implicit.preview"
  | "surface.implicit.mesh"
  | "volume.slice"
  | "volume.contour"
  | "volume.distance-field"
  | "volume.streamlines"
  | "curve.analyze"
  | "field.derived-profile"
  | "graph2d.parameter-study"
  | "symbolic.simplify"
  | "symbolic.solve"
  | "symbolic.factor"
  | "symbolic.expand"
  | "symbolic.singularities"
  | "symbolic.gradient"
  | "symbolic.hessian"
  | "polynomial.factor"
  | "polynomial.dossier"
  | "polynomial.roots.exact"
  | "matrix.eigen.exact"
  | "matrix.charpoly"
  | "matrix.linear-dossier"
  | "matrix.integer-forms"
  | "algebra.groebner"
  | "algebra.reconstruct"
  | "algebra.domains.inspect"
  | "number-field.element-dossier"
  | "number-field.prime-decomposition"
  | "ideal.groebner"
  | "ideal.eliminate"
  | "ideal.membership"
  | "ideal.quotient-dimension"
  | "ideal.syzygies"
  | "ideal.hilbert-series"
  | "number-theory.gcd"
  | "number-theory.mod-inverse"
  | "sage.console.execute";

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
    id: "mesh.analyze.differential",
    title: "Mesh differential analysis",
    canonicalOwner: "math3d-js",
    method: "numerical",
    environments: ["browser", "desktop", "server", "mobile"],
    legacyRequestKinds: [],
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
    id: "field.derived-profile",
    title: "Derived field line profile",
    canonicalOwner: "math3d-js",
    method: "numerical",
    environments: ["browser", "desktop", "server", "mobile"],
    legacyRequestKinds: [],
  },
  {
    id: "graph2d.parameter-study",
    title: "Graph parameter study",
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
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.solve",
    title: "Symbolic solve",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.factor",
    title: "Symbolic factorization",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.expand",
    title: "Symbolic expansion",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.singularities",
    title: "Symbolic singularities",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.gradient",
    title: "Symbolic gradient",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "symbolic.hessian",
    title: "Symbolic Hessian",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "polynomial.factor",
    title: "Exact polynomial factorization",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "polynomial.dossier",
    title: "Exact polynomial dossier over QQ",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "polynomial.roots.exact",
    title: "Exact polynomial roots",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "matrix.eigen.exact",
    title: "Exact matrix eigenvalues",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "matrix.charpoly",
    title: "Matrix characteristic polynomial",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "matrix.linear-dossier",
    title: "Exact QQ matrix RREF, kernel, image and minimal polynomial",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "matrix.integer-forms",
    title: "Exact Smith and Hermite forms over ZZ",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "algebra.groebner",
    title: "Gröbner basis",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "algebra.reconstruct",
    title: "Validated algebra object reconstruction",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "algebra.domains.inspect",
    title: "Algebra parent domains and canonical coercions",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "number-field.element-dossier",
    title: "Quadratic field norm, trace and embeddings",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "number-field.prime-decomposition",
    title: "Quadratic field prime ideal decomposition",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "ideal.groebner",
    title: "Saved ideal Gröbner basis",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "ideal.eliminate",
    title: "Saved ideal elimination",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "ideal.membership",
    title: "Saved ideal membership and normal form",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "ideal.quotient-dimension",
    title: "Pinned quotient ring dimension",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "ideal.syzygies",
    title: "Saved ideal generator syzygies",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "ideal.hilbert-series",
    title: "Graded quotient Hilbert series",
    canonicalOwner: "sage", method: "exact", environments: ["browser", "desktop", "server"], legacyRequestKinds: [],
  },
  {
    id: "number-theory.gcd",
    title: "Greatest common divisor",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "number-theory.mod-inverse",
    title: "Modular inverse",
    canonicalOwner: "sage",
    method: "exact",
    environments: ["browser", "desktop", "server"],
    legacyRequestKinds: [],
  },
  {
    id: "sage.console.execute",
    title: "Sage Console",
    canonicalOwner: "sage",
    method: "algorithmic",
    environments: ["desktop"],
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
