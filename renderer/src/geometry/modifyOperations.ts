import type { GeometrySemanticEntityKind } from "./semanticSelection";

export type GeometryModifyStatus = "available" | "warning" | "unavailable";
export type GeometryModifyRepresentation = "parametric" | "sampled-mesh" | "reference";
export type GeometryModifyBackend = "transform" | "parametric" | "sampled" | "cgal" | "discrete-topology";

export type GeometryModifyCommandId =
  | "translate"
  | "rotate"
  | "scale"
  | "align"
  | "duplicate"
  | "curve-trim"
  | "curve-split"
  | "curve-join"
  | "curve-extend"
  | "curve-offset"
  | "curve-reverse"
  | "curve-reparameterize"
  | "curve-approximate"
  | "curve-smooth"
  | "curve-degree"
  | "curve-knots"
  | "surface-trim"
  | "surface-untrim"
  | "surface-split"
  | "surface-join"
  | "surface-extend"
  | "surface-offset"
  | "surface-orientation"
  | "surface-project"
  | "surface-intersection"
  | "surface-degree"
  | "surface-knots"
  | "body-boolean"
  | "body-split"
  | "body-section"
  | "body-shell"
  | "body-thicken"
  | "body-offset"
  | "body-mirror"
  | "body-pattern"
  | "reference-move"
  | "reference-reorient"
  | "reference-rebuild"
  | "reference-align"
  | "reference-project"
  | "face-extrude"
  | "face-inset"
  | "face-delete"
  | "face-subdivide"
  | "edge-split"
  | "edge-bevel"
  | "edge-collapse"
  | "vertex-move"
  | "vertex-weld";

export type GeometryModifyGroupId = "transform" | "curve" | "surface" | "body" | "reference" | "discrete";

export type GeometryModifyCommand = {
  id: GeometryModifyCommandId;
  label: string;
  status: GeometryModifyStatus;
  backend: GeometryModifyBackend;
  explanation: string;
};

export type GeometryModifyGroup = {
  id: GeometryModifyGroupId;
  label: string;
  description: string;
  discrete: boolean;
  commands: readonly GeometryModifyCommand[];
};

export type GeometryModifyContext = {
  semanticKind: GeometrySemanticEntityKind | null;
  selectionCount: number;
  representation: GeometryModifyRepresentation;
  cgalReady: boolean;
  topologySelection: "face" | "edge" | "vertex" | null;
};

type CommandDefinition = {
  id: GeometryModifyCommandId;
  label: string;
  backend: GeometryModifyBackend;
  support: "direct" | "sampled" | "registered" | "exact-future";
  minSelection?: number;
  requiresTopology?: GeometryModifyContext["topologySelection"];
};

const command = (
  id: GeometryModifyCommandId,
  label: string,
  backend: GeometryModifyBackend,
  support: CommandDefinition["support"],
  minSelection?: number,
  requiresTopology?: CommandDefinition["requiresTopology"]
): CommandDefinition => ({ id, label, backend, support, minSelection, requiresTopology });

const TRANSFORM_COMMANDS: readonly CommandDefinition[] = [
  command("translate", "Translate", "transform", "direct"),
  command("rotate", "Rotate", "transform", "direct"),
  command("scale", "Scale", "transform", "direct"),
  command("align", "Align", "transform", "direct"),
  command("duplicate", "Duplicate", "transform", "direct"),
];

const CURVE_COMMANDS: readonly CommandDefinition[] = [
  command("curve-trim", "Trim", "sampled", "sampled"),
  command("curve-split", "Split", "discrete-topology", "sampled", undefined, "edge"),
  command("curve-join", "Join", "parametric", "exact-future", 2),
  command("curve-extend", "Extend", "sampled", "sampled"),
  command("curve-offset", "Offset", "sampled", "sampled"),
  command("curve-reverse", "Reverse", "parametric", "exact-future"),
  command("curve-reparameterize", "Reparameterize", "parametric", "exact-future"),
  command("curve-approximate", "Approximate", "sampled", "registered"),
  command("curve-smooth", "Smooth", "sampled", "registered"),
  command("curve-degree", "Degree", "parametric", "exact-future"),
  command("curve-knots", "Knots", "parametric", "exact-future"),
];

const SURFACE_COMMANDS: readonly CommandDefinition[] = [
  command("surface-trim", "Trim", "parametric", "exact-future"),
  command("surface-untrim", "Untrim", "parametric", "exact-future"),
  command("surface-split", "Split", "parametric", "exact-future"),
  command("surface-join", "Join", "parametric", "exact-future", 2),
  command("surface-extend", "Extend", "parametric", "exact-future"),
  command("surface-offset", "Offset", "sampled", "sampled"),
  command("surface-orientation", "Orientation", "parametric", "exact-future"),
  command("surface-project", "Projection", "sampled", "sampled", 2),
  command("surface-intersection", "Intersection", "sampled", "sampled", 2),
  command("surface-degree", "Degree", "parametric", "exact-future"),
  command("surface-knots", "Knots", "parametric", "exact-future"),
];

const BODY_COMMANDS: readonly CommandDefinition[] = [
  command("body-boolean", "Boolean", "cgal", "sampled", 2),
  command("body-split", "Split", "cgal", "sampled", 2),
  command("body-section", "Section", "sampled", "direct"),
  command("body-shell", "Shell", "parametric", "exact-future"),
  command("body-thicken", "Thicken", "parametric", "exact-future"),
  command("body-offset", "Offset", "parametric", "exact-future"),
  command("body-mirror", "Mirror", "transform", "direct"),
  command("body-pattern", "Pattern", "parametric", "exact-future"),
];

const REFERENCE_COMMANDS: readonly CommandDefinition[] = [
  command("reference-move", "Move", "transform", "direct"),
  command("reference-reorient", "Reorient", "transform", "direct"),
  command("reference-rebuild", "Rebuild", "parametric", "direct"),
  command("reference-align", "Align", "transform", "direct"),
  command("reference-project", "Project", "sampled", "sampled"),
];

const DISCRETE_BY_KIND: Partial<Record<GeometrySemanticEntityKind, readonly CommandDefinition[]>> = {
  surface: [
    command("face-extrude", "Extrude face", "discrete-topology", "direct"),
    command("face-inset", "Inset face", "discrete-topology", "direct"),
    command("face-delete", "Delete face", "discrete-topology", "direct"),
    command("face-subdivide", "Subdivide face", "discrete-topology", "direct"),
  ],
  curve: [
    command("edge-split", "Split edge", "discrete-topology", "direct"),
    command("edge-bevel", "Bevel edge", "discrete-topology", "direct"),
    command("edge-collapse", "Collapse edge", "discrete-topology", "direct"),
  ],
  "trim-loop": [
    command("edge-split", "Split edge", "discrete-topology", "direct"),
    command("edge-bevel", "Bevel edge", "discrete-topology", "direct"),
    command("edge-collapse", "Collapse edge", "discrete-topology", "direct"),
  ],
  point: [
    command("vertex-move", "Move vertex", "discrete-topology", "direct"),
    command("vertex-weld", "Weld vertices", "discrete-topology", "direct", 2),
  ],
};

const exactUnavailable = (representation: GeometryModifyRepresentation) =>
  representation === "sampled-mesh"
    ? "Unavailable for sampled mesh data; an exact curve/surface/body definition is required."
    : "Registered for this entity, but the exact editing kernel is delivered by later exact-representation milestones.";

const evaluate = (definition: CommandDefinition, context: GeometryModifyContext): GeometryModifyCommand => {
  if (context.selectionCount < 1) {
    return { ...definition, status: "unavailable", explanation: "Select a semantic Geometry entity first." };
  }
  if (definition.requiresTopology && context.topologySelection !== definition.requiresTopology) {
    return {
      ...definition,
      status: "unavailable",
      explanation: `Select a sampled ${definition.requiresTopology} to use this topology-backed command.`,
    };
  }
  if (definition.minSelection && context.selectionCount < definition.minSelection) {
    if (definition.support === "sampled") {
      return {
        ...definition,
        status: "warning",
        explanation: `Ready to collect another compatible operand; ${context.selectionCount} of ${definition.minSelection} selected.`,
      };
    }
    return {
      ...definition,
      status: "unavailable",
      explanation: `Select at least ${definition.minSelection} compatible entities; ${context.selectionCount} selected.`,
    };
  }
  if (definition.support === "exact-future") {
    return { ...definition, status: "unavailable", explanation: exactUnavailable(context.representation) };
  }
  if (definition.support === "registered") {
    return {
      ...definition,
      status: "unavailable",
      explanation: "Registered for this entity with an explicit capability state; no execution adapter is available in this build.",
    };
  }
  if (definition.backend === "discrete-topology" && context.representation !== "sampled-mesh") {
    return {
      ...definition,
      status: "warning",
      explanation: "Edits the sampled topology compatibility layer; the parametric source definition is not an exact topology target.",
    };
  }
  if (definition.backend === "sampled" && context.representation !== "sampled-mesh") {
    return {
      ...definition,
      status: "warning",
      explanation: "Available through the sampled compatibility backend; the parametric source and operation provenance are retained.",
    };
  }
  if (definition.backend === "cgal" && !context.cgalReady) {
    return {
      ...definition,
      status: "warning",
      explanation: "The command is available through the sampled preview workflow; robust CGAL execution is currently unavailable.",
    };
  }
  if (definition.support === "sampled") {
    return {
      ...definition,
      status: "warning",
      explanation: definition.backend === "cgal"
        ? "Uses the robust CGAL mesh backend and retains the Geometry source relationship."
        : "Uses the sampled compatibility backend and retains the Geometry source relationship.",
    };
  }
  return { ...definition, status: "available", explanation: `Ready using the ${definition.backend.replaceAll("-", " ")} backend.` };
};

const group = (
  id: GeometryModifyGroupId,
  label: string,
  description: string,
  definitions: readonly CommandDefinition[],
  context: GeometryModifyContext,
  discrete = false
): GeometryModifyGroup => ({
  id,
  label,
  description,
  discrete,
  commands: definitions.map((definition) => evaluate(definition, context)),
});

export const inferGeometryModifyRepresentation = (input: {
  objectType?: string | null;
  constructionKind?: string | null;
  constructionRole?: string | null;
}): GeometryModifyRepresentation => {
  if (input.constructionRole) return "reference";
  if (input.objectType === "mesh") return "sampled-mesh";
  return "parametric";
};

export const buildGeometryModifyGroups = (context: GeometryModifyContext): readonly GeometryModifyGroup[] => {
  if (!context.semanticKind) {
    return [group("transform", "Transform", "Select an entity to reveal applicable Modify tools.", TRANSFORM_COMMANDS, context)];
  }
  const groups: GeometryModifyGroup[] = [
    group("transform", "Transform", "Shared object and entity placement tools.", TRANSFORM_COMMANDS, context),
  ];
  if (context.semanticKind === "body" || context.semanticKind === "shell") {
    groups.push(group("body", "Body operations", "Solid and shell operations routed to exact or sampled backends.", BODY_COMMANDS, context));
  } else if (context.semanticKind === "surface") {
    groups.push(group("surface", "Surface operations", "Trimmed-surface and patch operations.", SURFACE_COMMANDS, context));
  } else if (context.semanticKind === "curve" || context.semanticKind === "trim-loop") {
    groups.push(group("curve", "Curve operations", "Curve editing and derived-curve operations.", CURVE_COMMANDS, context));
  } else if (context.semanticKind === "construction-role") {
    groups.push(group("reference", "Reference operations", "Move, orient, rebuild, align, and project construction geometry.", REFERENCE_COMMANDS, context));
  }
  const discrete = context.topologySelection ? DISCRETE_BY_KIND[context.semanticKind] : undefined;
  if (discrete) {
    groups.push(group(
      "discrete",
      "Discrete topology edits",
      "Compatibility tools for sampled face, edge, and vertex topology; exact Geometry definitions remain unchanged.",
      discrete,
      context,
      true
    ));
  }
  return groups;
};

export const GEOMETRY_MODIFY_COMMAND_IDS: readonly GeometryModifyCommandId[] = [
  ...TRANSFORM_COMMANDS,
  ...CURVE_COMMANDS,
  ...SURFACE_COMMANDS,
  ...BODY_COMMANDS,
  ...REFERENCE_COMMANDS,
  ...Object.values(DISCRETE_BY_KIND).flatMap((definitions) => definitions ?? []),
].map((entry) => entry.id).filter((id, index, ids) => ids.indexOf(id) === index);
