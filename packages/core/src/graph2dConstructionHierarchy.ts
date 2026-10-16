import type { Graph2DConstructionObject } from "./graph2dConstructions";
import type { Graph2DGraphObject, Graph2DSource } from "./graph2dDocument";

export type Graph2DConstructionTreeNode = Readonly<{
  object: Graph2DConstructionObject;
  children: readonly Graph2DConstructionTreeNode[];
}>;
export type Graph2DConstructionTreeGroup = Readonly<{
  source: Graph2DGraphObject;
  roots: readonly Graph2DConstructionTreeNode[];
}>;

/** Read-only Inspector hierarchy. The document's ordered dependency graph remains authoritative. */
export function graph2DConstructionHierarchy(source: Graph2DSource): readonly Graph2DConstructionTreeGroup[] {
  type MutableNode = { object: Graph2DConstructionObject; children: MutableNode[] };
  const groups = source.objects.map(object => ({ source: object, roots: [] as MutableNode[] }));
  const bySource = new Map(groups.map(group => [group.source.id, group]));
  const nodes = new Map<string, MutableNode>();
  for (const object of source.constructions?.objects ?? [])
    nodes.set(object.id, { object, children: [] });
  for (const object of source.constructions?.objects ?? []) {
    const node = nodes.get(object.id)!;
    const parent = object.inputs[0];
    if (!parent) continue;
    if (parent.kind === "construction") nodes.get(parent.objectId)?.children.push(node);
    else bySource.get(parent.objectId)?.roots.push(node);
  }
  return groups.filter(group => group.roots.length > 0);
}
