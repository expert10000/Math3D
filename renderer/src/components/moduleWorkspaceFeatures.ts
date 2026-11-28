import { ALGEBRA_OPERATION_REGISTRY, GRAPH2D_TOOLS, type ScientificModule } from "@math3d/core";
import { DEFAULT_CURVE_ANALYSIS_DEFINITIONS } from "../curveAnalysis/infrastructure";
import { DEFAULT_GEOMETRY_ANALYSIS_DEFINITIONS } from "../geometry/analysisInfrastructure";
import { DEFAULT_MESH_ANALYSIS_DEFINITIONS } from "../mesh/analysisRegistry";
import { DEFAULT_SURFACE_ANALYSIS_DEFINITIONS } from "../surfaceAnalysis/infrastructure";
import { VECTOR_FIELD_DERIVED_OPERATIONS } from "../vectorfield3d/VectorField3DDerivedOperationsPanel";

export type ModuleWorkspaceFeature = Readonly<{
  id: string;
  title: string;
  detail: string;
  group: "Create" | "Edit" | "View" | "Analyze" | "Export" | "Study";
}>;

const named = (id: string, title: string, detail: string,
  group: ModuleWorkspaceFeature["group"] = "Analyze"): ModuleWorkspaceFeature =>
  ({ id, title, detail, group });

const fromAnalysisRegistry = (module: ScientificModule,
  definitions: readonly { kind: string; label: string; family: string; domain: string }[]): ModuleWorkspaceFeature[] =>
  definitions.map(item => named(`${module}.${item.kind}`, item.label,
    `${item.family.replaceAll("-", " ")} · ${item.domain} domain`));

const numberTheoryAlgebra = (id: string, category: string) =>
  category === "number-theory" || /galois|finiteField|group\./i.test(id);

const sourceChoices = (module: ScientificModule, choices: readonly string[], detail: string) =>
  choices.map(choice => named(`${module}.create.${choice.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    choice, detail, "Create"));

/** Existing workspace entries. A listed control may still need a suitable source or runtime. */
export const MODULE_WORKSPACE_FEATURES: Readonly<Record<ScientificModule,
  readonly ModuleWorkspaceFeature[]>> = {
  graph2d: [
    ...sourceChoices("graph2d", ["Explicit", "Parametric", "Polar", "Implicit", "Inequality",
      "Point series", "Piecewise", "Slope field", "Trajectory", "Phase portrait", "Time ODE"],
    "Author or edit this Graph source in the Graphs workspace."),
    named("graph2d.edit", "Edit Graph objects", "Reopen a saved Graph source and change its definition or style.", "Edit"),
    named("graph2d.view", "Graph viewport and gallery", "Inspect plotted sources, presets and the Graph gallery.", "View"),
    ...GRAPH2D_TOOLS.slice(3).map(tool => named(`graph2d.tool.${tool.id}`, tool.label,
      tool.hint, "Analyze")),
    named("graph2d.area", "Area on an interval", "Explicit y(x) source and interval required."),
    named("graph2d.arc-length", "Arc length", "Explicit y(x) source and interval required."),
    named("graph2d.polar-area", "Polar swept area", "Polar source and angular bounds required."),
    named("graph2d.polar-arc-length", "Polar arc length", "Polar source and angular bounds required."),
    named("graph2d.phase", "Phase equilibria", "Phase portrait source required."),
    named("graph2d.vector-field", "Vector field diagnostics", "Vector field source required."),
    named("graph2d.export", "Graph publication and data export", "Use the Graph export controls for supported images, data and reports.", "Export"),
  ],
  graph3d: [],
  curve: [
    ...sourceChoices("curve", ["Parametric", "Explicit", "Implicit", "Polar", "Bézier",
      "B-spline", "NURBS", "Polyline", "Curve on Surface"],
    "Define this Curve representation in the Curves workspace where its source is supported."),
    named("curve.edit", "Definition and saved Curve editing", "Change a Curve definition and inspect its source revision.", "Edit"),
    named("curve.view", "Curve gallery and viewport", "Open examples and inspect the Curve in its viewer.", "View"),
    named("curve.derived", "Derived curves and CurveMesh", "Use the Derived curves and CurveMesh workspace tabs.", "Create"),
    ...fromAnalysisRegistry("curve", DEFAULT_CURVE_ANALYSIS_DEFINITIONS),
    named("curve.export", "Curve probe and diagnostic export", "Download saved probes or diagnostic tables as JSON or CSV.", "Export"),
  ],
  surface: [
    ...sourceChoices("surface", ["Explicit", "Implicit", "Parametric", "Spline", "Constructed"],
      "Create this Surface source family in the Surfaces workspace."),
    named("surface.edit", "Edit a saved Surface", "Reopen the source definition while preserving Project relationships.", "Edit"),
    named("surface.view", "Surface viewport and layers", "Inspect a Surface with chart, seam, normal and analysis layers where supported.", "View"),
    named("surface.mesh", "Create a project Mesh", "Tessellate a supported Surface and retain the source relationship.", "Create"),
    ...fromAnalysisRegistry("surface", DEFAULT_SURFACE_ANALYSIS_DEFINITIONS),
    named("surface.export", "Surface evidence export", "Export supported layer evidence as JSON or CSV.", "Export"),
  ],
  mesh: [
    named("mesh.create", "Mesh presets and import", "Create a preset Mesh or load supported STL, OBJ, PLY and GLTF sources.", "Create"),
    named("mesh.edit", "Mesh repair and processing", "Use available repair, remesh, smooth and simplification controls on a compatible Mesh.", "Edit"),
    named("mesh.view", "Mesh viewport and topology", "Inspect the Mesh, normals, faces and topology information.", "View"),
    ...fromAnalysisRegistry("mesh", DEFAULT_MESH_ANALYSIS_DEFINITIONS),
    named("mesh.export", "Mesh export", "Export supported Mesh data as GLB, OBJ or PLY.", "Export"),
  ],
  geometry: [
    named("geometry.create", "Geometry construction", "Create objects and constructions in the Build workspace.", "Create"),
    named("geometry.edit", "Transform and constrain", "Edit constructed objects, transforms and constraints.", "Edit"),
    named("geometry.view", "Inspect and scene workspaces", "Inspect objects and their relationships in the viewport and Scene tab.", "View"),
    named("geometry.claims", "Claims and scripts", "Use the Claims and Script tabs for recorded construction evidence.", "Study"),
    ...fromAnalysisRegistry("geometry", DEFAULT_GEOMETRY_ANALYSIS_DEFINITIONS),
    named("geometry.export", "Geometry scene export", "Export visible scene meshes as GLB.", "Export"),
  ],
  volume: [
    named("volume.create", "Volume sources", "Create or open sampled scalar Volume data in a Project.", "Create"),
    named("volume.view", "Volume viewer and slices", "Inspect the 3D Volume, orthogonal slices and slice histogram.", "View"),
    named("volume.isosurface", "Isosurface visualization", "Extract and view a supported isovalue surface.", "View"),
    named("volume.volume-statistics", "Volume statistics", "Finite samples, histogram and percentiles."),
    named("volume.derivative-fields", "Derivative fields", "Gradient, Hessian and Laplacian on a sampled grid."),
    named("volume.threshold-region", "Threshold region", "Region size, centroid, bounds and components."),
    named("volume.critical-points", "Critical point candidates", "Sampled gradient and local classification."),
    named("volume.iso-statistics", "Isovalue statistics", "Counts and crossing edges for an isovalue."),
    named("volume.export", "Volume scientific export", "Export supported arrays as NPY with JSON metadata; export pinned probes as CSV.", "Export"),
  ],
  topology: [
    named("topology.create", "Complex presets and editor", "Start from a preset or edit a finite complex.", "Create"),
    named("topology.view", "Complex and realization views", "Inspect algebraic data and supported 3D realizations.", "View"),
    named("topology.structural-validation", "Structural validation", "Check a canonical finite 2-complex."),
    named("topology.cellular-boundaries", "Cellular boundary operators", "Exact cellular chain data."),
    named("topology.homology", "Homology", "Exact homology of a finite 2-complex."),
    named("topology.euler-consistency", "Euler and homology consistency", "Compare independent topological invariants."),
    named("topology.fundamental-group", "Fundamental group", "Derive a presentation from the complex."),
    named("topology.surface-classification", "Surface classification", "Classify a certified surface."),
  ],
  cas: [
    named("cas.create", "Symbolic expressions and operations", "Enter a supported expression or exact algebra request.", "Create"),
    named("cas.view", "Exact result and provenance", "Inspect the returned exact result and its recorded method.", "View"),
    ...ALGEBRA_OPERATION_REGISTRY.filter(item => !numberTheoryAlgebra(item.id, item.category))
    .map(item => named(`cas.${item.id}`, item.label,
      `${item.category} · ${item.domain} domain · Sage backend required`)),
  ],
  "number-theory": [
    named("number-theory.create", "Number theory workbench", "Enter supported integers, polynomials, fields or groups for exact operations.", "Create"),
    named("number-theory.view", "Exact result and provenance", "Inspect an exact Sage result and its recorded source.", "View"),
    ...ALGEBRA_OPERATION_REGISTRY.filter(item => numberTheoryAlgebra(item.id, item.category))
    .map(item => named(`number-theory.${item.id}`, item.label,
      `${item.category} · ${item.domain} domain · Sage backend required`)),
  ],
  complex: [
    named("complex.create", "Function and contour definition", "Enter a Complex function and define a supported contour.", "Create"),
    named("complex.view", "Domain coloring and sphere views", "Inspect complex values in domain coloring and Riemann sphere views.", "View"),
    named("complex.mapping", "Möbius mapping lab", "Inspect mapped points and Z/W plane views.", "View"),
    named("complex.exact-derivative", "Exact derivative", "Supported normalized expression required."),
    named("complex.singularity-residue-series", "Singularities, residues and series", "Reviewed exact profiles only."),
    named("complex.contour-integral", "Contour integral", "Committed closed contour required."),
    named("complex.argument-principle", "Argument principle", "Numerical winding on a committed contour."),
    named("complex.export", "Z/W plane image export", "Export supported mapping views as SVG.", "Export"),
  ],
  field: [
    named("field.create", "Vector field source", "Define or open a supported 3D vector field.", "Create"),
    named("field.view", "Field, stream and slice views", "Inspect vector arrows, trajectories, slices and derived geometry.", "View"),
    named("field.divergence", "Divergence", "Verified 3D vector field required."),
    named("field.curl", "Curl", "Verified 3D vector field required."),
    named("field.streamlines", "Streamlines", "Verified field and seed group required."),
    ...VECTOR_FIELD_DERIVED_OPERATIONS.map(id => named(`field.derived.${id}`,
      id.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase()),
      "Saved Project and compatible field source required.", "Analyze")),
  ],
  quantum: [
    named("quantum.create", "Verified quantum scene examples", "Open a bundled quantum scene or a Project Study with verified source data.", "Create"),
    named("quantum.view", "Quantum scene preview and overlays", "Inspect field, slice, Volume and topology overlays where the scene provides them.", "View"),
    named("quantum.qwz-curvature", "QWZ curvature evidence", "Verified QWZ Study source required.", "Study"),
    named("quantum.band-profile", "Band profile", "Verified quantum Study source required.", "Study"),
    named("quantum.scene-inspector", "Quantum scene inspection", "Open a verified quantum scene bundle.", "Study"),
  ],
};

export const MODULE_WORKSPACE_ENTRY: Readonly<Record<ScientificModule, string>> = {
  graph2d: "Graphs", graph3d: "No dedicated Graph 3D workspace in this build",
  curve: "Curves", surface: "Surfaces", mesh: "Mesh",
  geometry: "Geometry", volume: "Volume", topology: "Topology",
  cas: "CAS / Algebra → Operations", "number-theory": "Number Theory → Operations",
  complex: "Complex Analysis → Function Explorer", field: "Graphs → Field Explorer",
  quantum: "File → Verified quantum examples / Project Studies",
};
