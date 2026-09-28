import { GRAPH2D_MAX_PINNED_PROBES, type Graph2DDocument, type Graph2DPinnedProbe } from "@math3d/core";

export type MobileGraphProbeAction = { type: "pin"; label: string } | { type: "delete"; id: string } |
  { type: "rename"; id: string; label: string } | { type: "reorder"; id: string; toIndex: number };

/** Ordered, bounded source-linked observations, never a drawing layer or new mathematical source. */
export const editMobileGraphProbes = (document: Graph2DDocument, action: MobileGraphProbeAction): readonly Graph2DPinnedProbe[] => {
  const probes = [...document.display.pinnedProbes ?? []];
  const label = "label" in action ? action.label.trim() : "";
  if ("label" in action && (!label || label.length > 80)) throw new TypeError("Use a probe label of 1–80 characters.");
  if (action.type === "pin") {
    const probe = document.selection.probe;
    if (!probe || document.source.objects.find((object) => object.id === probe.objectId)?.kind !== "explicit-cartesian")
      throw new TypeError("Tap an explicit curve before pinning a probe.");
    if (probes.length >= GRAPH2D_MAX_PINNED_PROBES) throw new TypeError(`At most ${GRAPH2D_MAX_PINNED_PROBES} probes may be saved.`);
    let serial = 1; while (probes.some((entry) => entry.id === `probe_${serial}`)) serial++;
    probes.push({ id: `probe_${serial}`, label, objectId: probe.objectId, x: probe.x, y: probe.y,
      sourceHash: document.identity.structuralHash });
  } else {
    const index = probes.findIndex((probe) => probe.id === action.id);
    if (index < 0) throw new TypeError("Saved probe does not exist.");
    if (action.type === "delete") probes.splice(index, 1);
    if (action.type === "rename") probes[index] = { ...probes[index]!, label };
    if (action.type === "reorder") {
      if (!Number.isInteger(action.toIndex) || action.toIndex < 0 || action.toIndex >= probes.length) throw new TypeError("Invalid probe position.");
      probes.splice(action.toIndex, 0, probes.splice(index, 1)[0]!);
    }
  }
  return probes;
};

export const compareMobileGraphProbes = (document: Graph2DDocument): string => {
  const [a, b] = document.display.pinnedProbes ?? [];
  if (!a || !b) return "Pin two probes to compare the first two in the list.";
  if ([a, b].some((probe) => probe.sourceHash !== document.identity.structuralHash)) return "Comparison unavailable: saved probes are stale. Delete and pin again.";
  const dx = b.x - a.x, dy = b.y - a.y;
  return `Δx=${dx.toPrecision(6)}, Δy=${dy.toPrecision(6)}, distance=${Math.hypot(dx, dy).toPrecision(6)}${dx === 0 ? ", slope undefined" : `, secant slope=${(dy / dx).toPrecision(6)}`}`;
};
