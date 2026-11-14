import { MATH3D_PROJECT_TEMPLATES, type Math3DProjectTemplateId } from "@math3d/core";
import { NOTEBOOK_STARTERS, type NotebookStarterId } from "./notebookStarters";

export type CuratedStarterId = Math3DProjectTemplateId | NotebookStarterId;
export type CuratedStudy = Readonly<{
  id: string;
  route: Readonly<{ kind: "project"; starterId: CuratedStarterId }> |
    Readonly<{ kind: "verified-quantum-import"; model: "qwz" | "ssh" | "hydrogen" }> |
    Readonly<{ kind: "field-explorer" }> |
    Readonly<{ kind: "cas-gallery" }>;
  field: "Geometry" | "Fields" | "Topology" | "Analysis" | "Quantum" | "Algebra" | "Provenance";
  question: string;
  objects: string;
  operations: string;
  insight: string;
  prerequisites: string;
  platforms: readonly ("desktop" | "browser")[];
  approximateAssets: string;
  offline: string;
  firstOpen: string;
  reset: string;
  limitation: string;
}>;

const project = (id: CuratedStarterId, field: CuratedStudy["field"], question: string,
  objects: string, operations: string, insight: string, limitation: string,
  options: Partial<Pick<CuratedStudy, "prerequisites" | "platforms" | "approximateAssets" | "offline" | "firstOpen" | "reset">> = {}): CuratedStudy => ({
  id, route: { kind: "project", starterId: id }, field, question, objects, operations, insight,
  prerequisites: options.prerequisites ?? "None; built-in Project source and saved records.",
  platforms: options.platforms ?? ["desktop", "browser"],
  approximateAssets: options.approximateAssets ?? "Small built-in documents; size depends on the generated Project copy.",
  offline: options.offline ?? "Opens from bundled source without a network connection.",
  firstOpen: options.firstOpen ?? "Creates an independent Project copy and opens its saved documents.",
  reset: options.reset ?? "Use New copy to start again without replacing an edited Project.", limitation,
});

const quantum = (model: "qwz" | "ssh" | "hydrogen", question: string, objects: string,
  operations: string, insight: string, limitation: string): CuratedStudy => ({
  id: `quantum-${model}`, route: { kind: "verified-quantum-import", model }, field: "Quantum",
  question, objects, operations, insight,
  prerequisites: "Desktop app and an existing producer-created .qscene bundle for this model.",
  platforms: ["desktop"], approximateAssets: "External scene bundle; size depends on producer grid and attached arrays.",
  offline: "A local saved bundle can be reopened offline; creating one requires a separate producer.",
  firstOpen: "Choose Open verified quantum scene and select the matching local bundle; no scene is bundled with this card.",
  reset: "Reopen the original bundle or import another verified producer result.", limitation,
});

/** Curated journeys are a subset of working starters plus explicit external-scene entry points. */
export const CURATED_STUDIES: readonly CuratedStudy[] = Object.freeze([
  project("catenary-study", "Geometry", "How does a catenary generate a catenoid?",
    "Graph profile, Curve snapshot, revolution Surface", "Inspect the derivative and exact source relations",
    "The saved construction connects three representations.",
    "The numerical derivative is not a proof of minimality; curvature and geodesics are follow-up work."),
  project("scene-topology-study", "Topology", "How do constructions and incidence differ?",
    "Midpoint, circle, CW interval, simplicial triangle", "Inspect source constructions and incidence counts",
    "The Project retains geometric and topological records together.",
    "The triangle is schematic; no homology result is saved."),
  project("geometry-note-pins", "Geometry", "What happens to a surface Note after a shape edit?",
    "Box, sphere and local Note anchors", "Move an object, then change its shape",
    "A transform preserves an object-local pin; a changed shape makes it stale.",
    "A pin follows the saved object transform, not an arbitrary new surface."),
  project("derivative-study", "Analysis", "When does a saved derivative become historical?",
    "Parabola, Curve snapshot, numerical result", "Inspect and edit the source Graph",
    "The result keeps the original source generation.",
    "The recorded derivative is numerical and local, not a symbolic identity."),
  project("catenoid-evidence", "Geometry", "Which curvature claims have saved evidence?",
    "Catenoid Surface, saved Mesh, Workbook and Notes", "Inspect curvature and the bounded claim",
    "A Workbook ties a scalar statement to a recorded generation.",
    "Mesh curvature is discrete; it does not prove analytic minimality.",
    { platforms: ["desktop"], prerequisites: "Desktop source build; built-in Mesh computation on first open.",
      approximateAssets: "Generated Mesh sidecar; size depends on the built-in sampling resolution.",
      firstOpen: "Prepares a saved Mesh and Workbook; first open may take longer than lightweight starters." }),
  project("edge-path-evidence", "Analysis", "Can a Mesh path claim be traced to exact edges?",
    "Saved Mesh, edge path result, Workbook", "Inspect edge IDs, path length and cited source",
    "The claim is qualified by the saved result and its Mesh generation.",
    "Opening an imported preview-only Surface source requires a supported editor host.",
    { platforms: ["desktop"], approximateAssets: "Generated Mesh and Workbook sidecars; size varies by Mesh resolution." }),
  project("graph-derivative-notebook", "Analysis", "How do Graph, Curve and a derivative share evidence?",
    "Graph, Curve, result, Workbook and Notes", "Follow source links and inspect the recorded derivative",
    "The narrative distinguishes a live source from a captured result.",
    "Changing the Graph does not silently recompute or relink the saved result."),
  project("ripple-wave-study", "Fields", "What survives a Graph-to-Surface wave construction?",
    "Wave Graph, Surface, Mesh snapshot, Geometry markers", "Follow relations and open the research Workbook",
    "Each stage retains its generating source identity.",
    "The Mesh snapshot and sample markers are not an accuracy or curvature claim.",
    { platforms: ["desktop"], approximateAssets: "Generated Mesh sidecar; size depends on sampling." }),
  project("mesh-comparison-study", "Analysis", "How do saved Mesh generations compare?",
    "Three retained Mesh generations and quality results", "Pin A/B points and inspect the saved trend",
    "A comparison refers to explicit revisions rather than the latest Mesh alone.",
    "The metric is a recorded Mesh quality result, not a convergence proof.",
    { platforms: ["desktop"], approximateAssets: "Three generated Mesh generations and result records." }),
  project("mesh-curvature-study", "Geometry", "How does discrete curvature vary with Mesh scale?",
    "Three triangulated sphere generations", "Compare saved mean and Gaussian curvature scalars",
    "The trend retains the sampled Mesh generation for each value.",
    "Discrete curvature depends on triangulation and estimator convention.",
    { platforms: ["desktop"], approximateAssets: "Three generated Mesh sidecars and curvature records." }),
  project("surface-geometry-probe", "Geometry", "Can two models share a declared coordinate frame?",
    "Surface and Geometry sources with metre coordinates", "Pick a source-backed coordinate in the comparison",
    "The overlay records its frame assertion and exact source revisions.",
    "A shared coordinate does not imply the two shapes are equivalent."),
  { id: "field-graph-return", route: { kind: "field-explorer" }, field: "Fields",
    question: "Can a saved Graph row return to the exact Field position that produced it?",
    objects: "One static analytic Field, a finite XY line profile, Graph, Study and Workbook",
    operations: "Open Field Explorer, save a line profile to Graphs, select a row and return to its Field source",
    insight: "The row and returned position retain the exact Field generation and declared physical plane.",
    prerequisites: "Desktop app with a named Project; use a static analytic Field on its declared XY plane.",
    platforms: ["desktop"], approximateAssets: "Small local analytic source and finite Graph rows; no external scene bundle.",
    offline: "The analytic Field and saved Project can reopen offline; source identity is rechecked on return.",
    firstOpen: "Opens Scientific Field Explorer in Graphs; create and save a Project for the Study and Workbook.",
    reset: "Start another named Project or create a new Field generation; the old Graph remains historical.",
    limitation: "This bounded line profile does not reconstruct an arbitrary Field or certify time-dependent flow." },
  quantum("qwz", "How does a QWZ band selection relate to Berry curvature?",
    "Producer bands and curvature scenes", "Import verified scenes, then create a four-view Project Study",
    "A pinned k sample can be projected with an explicit offset and exported as qualified evidence.",
    "The band and curvature grids may differ; the mapping is nearest-sample, not exact coincidence."),
  quantum("ssh", "Which saved SSH states concentrate at an edge?",
    "Producer lattice, spectrum and edge-density scenes", "Import verified SSH scene bundles",
    "Saved producer data can be inspected without rerunning a solver.",
    "The card does not contain a built-in SSH Project or guarantee a producer on this host."),
  quantum("hydrogen", "How do orbital amplitude and density views differ?",
    "Producer orbital field and derived visual representations", "Import a verified hydrogen scene bundle",
    "The saved scene declares its quantity and producer provenance.",
    "Amplitude and density are distinct quantities; no bundle or producer is included."),
  { id: "cas-structures", route: { kind: "cas-gallery" }, field: "Algebra",
    question: "How do a field, group, ideal and module retain exact definitions?",
    objects: "GF(5), cyclic C4, a nilpotent ideal and a torsion module",
    operations: "Open the CAS examples and save a validated definition chain into a named Project",
    insight: "Each example stores its parent objects and a primary structure with expected answers and a failure case.",
    prerequisites: "A named Project is needed to save an example; computation backends have separate capability checks.",
    platforms: ["desktop", "browser"], approximateAssets: "Small built-in algebra definitions; no scene sidecar.",
    offline: "Definition examples are bundled and can be saved offline; backend calculations depend on the selected route.",
    firstOpen: "Opens CAS / Algebra. Expand Curated algebra examples and choose a validated structure.",
    reset: "Create another named Project or save a different example; existing object revisions stay in the original Project.",
    limitation: "These four structural examples do not constitute a Galois correspondence Study or a verified Sage computation." },
]);

export const curatedStudy = (id: string) => CURATED_STUDIES.find(item => item.id === id) ?? null;

export function validateCuratedStudyCatalog(): void {
  const starterIds = new Set<string>([...MATH3D_PROJECT_TEMPLATES, ...NOTEBOOK_STARTERS].map(item => item.id));
  const seen = new Set<string>();
  for (const item of CURATED_STUDIES) {
    if (seen.has(item.id)) throw new TypeError(`Duplicate curated Study ${item.id}.`);
    seen.add(item.id);
    if (item.route.kind === "project" && (!starterIds.has(item.route.starterId) || item.id !== item.route.starterId))
      throw new TypeError(`Curated Study ${item.id} has no working Project starter.`);
    if (item.route.kind === "verified-quantum-import" && item.id !== `quantum-${item.route.model}`)
      throw new TypeError(`Curated Study ${item.id} has an invalid quantum route.`);
    if (item.route.kind === "cas-gallery" && item.id !== "cas-structures")
      throw new TypeError(`Curated Study ${item.id} has an invalid CAS route.`);
    if (item.route.kind === "field-explorer" && item.id !== "field-graph-return")
      throw new TypeError(`Curated Study ${item.id} has an invalid Field Explorer route.`);
    if (!item.platforms.length || Object.values(item).some(value => typeof value === "string" && !value.trim()))
      throw new TypeError(`Curated Study ${item.id} has incomplete guidance.`);
  }
}
