import {
  createConstructionGraph,
  type ConstructionGraph,
  type ConstructionGraphEdge,
  type ConstructionGraphNode,
} from "../constructionGraph";
import {
  buildDerivedConstructionDependencyGraph,
  type ConstructionRelationshipDefinition,
  type DerivedConstructionObjectDefinition,
} from "./constructionObjects";

export const buildConstructionGraphFromDerivedConstructions = (
  definitions: DerivedConstructionObjectDefinition[],
  relationships: ConstructionRelationshipDefinition[] = []
): ConstructionGraph => {
  const dependencies = buildDerivedConstructionDependencyGraph(definitions, relationships);
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition] as const));
  const nodes: ConstructionGraphNode[] = [
    ...dependencies.sourcePointIds.map(
      (id): ConstructionGraphNode => ({
        id,
        kind: "geometry",
        type: "source-point",
        label: id,
        status: "valid",
      })
    ),
    ...definitions.map(
      (definition): ConstructionGraphNode => ({
        id: definition.id,
        kind: "construction",
        type: definition.type,
        label: definition.name ?? definition.id,
        status: dependencies.cyclicConstructionIds.includes(definition.id) ? "invalid" : "valid",
        visible: definition.visible,
        data: definition,
      })
    ),
  ];
  const edges: ConstructionGraphEdge[] = [];
  for (const definition of definitions) {
    for (const [index, sourceId] of (definition.sourceObjectIds ?? []).entries()) {
      edges.push({
        id: `dependency:${sourceId}:${definition.id}:object:${index}`,
        sourceId,
        targetId: definition.id,
        relation: "depends-on",
      });
    }
    if (definition.sourceConstructionId) {
      edges.push({
        id: `dependency:${definition.sourceConstructionId}:${definition.id}:construction`,
        sourceId: definition.sourceConstructionId,
        targetId: definition.id,
        relation: "depends-on",
      });
    }
  }

  for (const relationship of relationships) {
    if (relationship.enabled === false || !definitionById.has(relationship.targetId)) continue;
    edges.push({
      id: `relationship:${relationship.id}`,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      relation: `constraint:${relationship.type}`,
      enabled: relationship.enabled,
      metadata: { relationshipId: relationship.id },
    });
  }

  return createConstructionGraph(nodes, edges);
};
