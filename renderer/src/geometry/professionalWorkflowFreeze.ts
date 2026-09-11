import {
  GEOMETRY_PROFESSIONAL_ACTIONS,
  GEOMETRY_PROFESSIONAL_EXPANDED_GROUPS,
  GEOMETRY_PROFESSIONAL_PANELS,
  GEOMETRY_PROFESSIONAL_TOOLS,
} from "./professionalWorkflow";

export type GeometryFrozenRegion = "left" | "center" | "right";

export type GeometryFrozenJourney = {
  id: string;
  label: string;
  stages: readonly string[];
  invariant: string;
};

export const GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE = {
  version: 1,
  date: "2026-09-11",
  regions: {
    left: "Choose Geometry tasks, construction or analysis parameters, and primary configuration.",
    center: "Interact with the shared scientific scene, semantic selection, previews, overlays, and camera.",
    right: "Explain selection, Geometry, analysis results, diagnostics, provenance, history, and contextual actions.",
  } satisfies Record<GeometryFrozenRegion, string>,
  journeys: [
    { id: "construct-inspect-analyze", label: "Construct → Select → Inspect → Analyze", stages: ["construct", "select", "inspect", "analyze"], invariant: "Semantic identity and source revision remain stable." },
    { id: "modify-compare", label: "Construct → Modify → Analyze → Compare revisions", stages: ["construct", "modify", "analyze", "compare"], invariant: "Both revisions remain visible with explicit provenance." },
    { id: "validate-repair", label: "Validate → select issue → frame issue → inspect or repair", stages: ["validate", "select-issue", "frame", "inspect-or-repair"], invariant: "Diagnostics never silently mutate exact Geometry." },
    { id: "geometry-mesh-compare", label: "Geometry → derived Mesh → Mesh Analyze → exact-versus-discrete Compare", stages: ["geometry", "derive-mesh", "mesh-analyze", "compare"], invariant: "Analytic and discrete values remain distinct." },
    { id: "mesh-open-geometry", label: "Mesh derivative → Open Geometry Source → mapped selection → analytic analysis", stages: ["mesh-derivative", "open-geometry", "mapped-selection", "analytic-analysis"], invariant: "Trace confidence and source identity remain inspectable." },
    { id: "saved-result-stale", label: "Analyze → Save → modify source → stale warning → recompute/compare", stages: ["analyze", "save", "modify", "stale-warning", "recompute-or-compare"], invariant: "Stale payload is preserved but cannot drive the viewport." },
    { id: "workspace-roundtrip", label: "Gallery/New/Demo/Procedural/Scratch/Workbook/Construction Lab/Scene Script round trip", stages: ["open", "edit", "serialize", "reload"], invariant: "Every established workspace remains reachable and round-trips state." },
  ] as readonly GeometryFrozenJourney[],
  decisions: {
    modeStrip: "retained-secondary-navigation",
    galleries: "object-and-scene-tabs-under-gallery",
    scratch: "retained-in-new-and-mode-strip",
    sceneScript: "retained-under-more-and-procedural-panel",
    topologyTools: "geometry-semantic-tools-with-mesh-handoff-for-discrete-edits",
    duplicateControls: "retained-until-a-separately-accepted-replacement",
  } as const,
} as const;

export type GeometryWorkflowFreezeValidation = { ok: boolean; errors: string[] };

export const validateGeometryProfessionalWorkflowFreeze = (): GeometryWorkflowFreezeValidation => {
  const errors: string[] = [];
  const journeys = GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.journeys;
  const ids = journeys.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) errors.push("Frozen journey ids must be unique.");
  if (journeys.some((entry) => entry.stages.length < 4 || !entry.invariant.trim())) errors.push("Every frozen journey needs four or more stages and an invariant.");

  const labels = [
    ...GEOMETRY_PROFESSIONAL_PANELS.map((entry) => entry.label),
    ...GEOMETRY_PROFESSIONAL_ACTIONS.map((entry) => entry.label),
    ...GEOMETRY_PROFESSIONAL_TOOLS.map((entry) => entry.label),
    ...GEOMETRY_PROFESSIONAL_EXPANDED_GROUPS.flatMap((group) => group.entries.map((entry) => entry.label)),
  ];
  for (const required of ["Gallery", "New", "Demo", "Procedural", "Scratch", "Workbook", "Construction Lab", "Scene Script", "Construct", "Modify", "Analyze"]) {
    if (!labels.includes(required)) errors.push(`Frozen entry point is unreachable: ${required}.`);
  }
  if (Object.values(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.regions).some((description) => !description.trim())) errors.push("Every frozen layout region needs a responsibility.");
  return { ok: errors.length === 0, errors };
};
