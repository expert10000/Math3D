export type TopologyOverlayGroup = { id: "zone" | "path" | "integration" | "marker";
  label: string; objectIds: string[] };

/** Inventory only source-declared geometry. A marker or enclosing surface does not establish a charge. */
export function quantumTopologyOverlayGroups(scene: {
  objects: readonly { id: string }[];
  reciprocal?: { boundaryObjects: readonly string[]; paths: readonly { object: string }[] };
}): TopologyOverlayGroup[] {
  const known = new Set(scene.objects.map(object => object.id));
  const groups: TopologyOverlayGroup[] = [
    { id: "zone", label: "Brillouin-zone boundary", objectIds: scene.reciprocal?.boundaryObjects.filter(id => known.has(id)) ?? [] },
    { id: "path", label: "Stored k-path", objectIds: scene.reciprocal?.paths.map(path => path.object).filter(id => known.has(id)) ?? [] },
    { id: "integration", label: "Integration surface", objectIds: scene.objects.filter(object =>
      /(?:^|-)sphere$|^integration-/.test(object.id)).map(object => object.id) },
    { id: "marker", label: "Node or gap marker", objectIds: scene.objects.filter(object =>
      /(?:^|-)node$|gap-clos(?:ing|ure)/.test(object.id)).map(object => object.id) },
  ];
  return groups.filter(group => group.objectIds.length > 0);
}

export function topologyOverlayObjectVisible(id: string | undefined, hidden: ReadonlySet<string>): boolean {
  if (!id) return true;
  for (const objectId of hidden) if (id === objectId || id.startsWith(`${objectId}:`)) return false;
  return true;
}
