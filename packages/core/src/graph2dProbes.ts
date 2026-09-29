import { GRAPH2D_MAX_PINNED_PROBES, type Graph2DDocument, type Graph2DPinnedProbe } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { graph2DWorldToScreen, type Graph2DScreenSize } from "./graph2dViewport";
export type Graph2DProbeAction = { type: "pin"; label: string } | { type: "delete" | "visibility"; id: string } |
  { type: "rename"; id: string; label: string } | { type: "reorder"; id: string; toIndex: number };
export function editGraph2DProbes(document: Graph2DDocument, action: Graph2DProbeAction): readonly Graph2DPinnedProbe[] {
  const probes = [...document.display.pinnedProbes ?? []], label = "label" in action ? action.label.trim() : "";
  if ("label" in action && (!label || label.length > 80)) throw new TypeError("Use a probe label of 1–80 characters.");
  if (action.type === "pin") {
    const probe = document.selection.probe, object = document.source.objects.find(o => o.id === probe?.objectId);
    if (!probe || object?.kind !== "explicit-cartesian") throw new TypeError("Commit an explicit-function probe before pinning.");
    if (!Number.isFinite(probe.x) || probe.x < object.domain.min || probe.x > object.domain.max ||
      probe.x === object.domain.min && !object.domain.includeMin || probe.x === object.domain.max && !object.domain.includeMax)
      throw new TypeError("Probe is outside the authored domain.");
    const value = evaluateGraph2DExpression(object.expression.ast, { ...Object.fromEntries(document.source.variables.map(p => [p.name, p.value])), x: probe.x });
    if (!value.ok) throw new TypeError("Probe is undefined in the current source.");
    if (probes.length >= GRAPH2D_MAX_PINNED_PROBES) throw new TypeError(`At most ${GRAPH2D_MAX_PINNED_PROBES} probes may be saved.`);
    let serial = 1; while (probes.some(p => p.id === `probe_${serial}`)) serial++;
    probes.push({ id: `probe_${serial}`, label, objectId: object.id, x: probe.x, y: value.value, sourceHash: document.identity.structuralHash });
  } else {
    const index = probes.findIndex(p => p.id === action.id);
    if (index < 0) throw new TypeError("Saved probe does not exist.");
    if (action.type === "delete") probes.splice(index, 1);
    if (action.type === "rename") probes[index] = { ...probes[index]!, label };
    if (action.type === "visibility") probes[index] = { ...probes[index]!, visible: probes[index]!.visible === false };
    if (action.type === "reorder") {
      if (!Number.isInteger(action.toIndex) || action.toIndex < 0 || action.toIndex >= probes.length) throw new TypeError("Invalid probe position.");
      probes.splice(action.toIndex, 0, probes.splice(index, 1)[0]!);
    }
  }
  return probes;
}
export function graph2DPinnedProbeState(document: Graph2DDocument, probe: Graph2DPinnedProbe): "current" | "stale" | "hidden" | "invalid" {
  if (probe.sourceHash !== document.identity.structuralHash) return "stale";
  const object = document.source.objects.find(o => o.id === probe.objectId);
  if (object?.kind !== "explicit-cartesian" || !Number.isFinite(probe.x) || !Number.isFinite(probe.y) ||
    probe.x < object.domain.min || probe.x > object.domain.max || probe.x === object.domain.min && !object.domain.includeMin ||
    probe.x === object.domain.max && !object.domain.includeMax || document.display.viewport.xScale === "log10" && probe.x <= 0 ||
    document.display.viewport.yScale === "log10" && probe.y <= 0) return "invalid";
  const value = evaluateGraph2DExpression(object.expression.ast, { ...Object.fromEntries(document.source.variables.map(p => [p.name, p.value])), x: probe.x });
  if (!value.ok || Math.abs(value.value - probe.y) > 1e-10 * Math.max(1, Math.abs(value.value))) return "invalid";
  return probe.visible === false || !document.display.objects.some(s => s.objectId === probe.objectId && s.visible) ? "hidden" : "current";
}
export function projectGraph2DProbeMarkers(document: Graph2DDocument, size: Graph2DScreenSize) {
  const occupied: { x: number; y: number; width: number }[] = [];
  return (document.display.pinnedProbes ?? []).flatMap(probe => {
    if (graph2DPinnedProbeState(document, probe) !== "current") return [];
    const point = graph2DWorldToScreen(document.display.viewport, size, probe);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) return [];
    const text = `${probe.label}: (${Number(probe.x.toPrecision(5))}, ${Number(probe.y.toPrecision(5))})`;
    const width = Math.min(Math.max(0, size.width - 8), text.length * 7 + 8);
    const x = Math.max(4, Math.min(size.width - width - 4, point.x + 9));
    let label: { x: number; y: number; width: number } | null = null;
    for (const offset of [-24, 10, -44, 30, -64, 50]) {
      const y = Math.max(4, Math.min(size.height - 20, point.y + offset));
      if (size.width < 80 || size.height < 24 || occupied.some(p => Math.abs(p.y - y) < 20 && x < p.x + p.width && x + width > p.x)) continue;
      label = { x, y, width }; occupied.push(label); break;
    }
    return [{ probe, point, text, label }];
  });
}
export function compareGraph2DProbes(document: Graph2DDocument): string {
  const [a, b] = document.display.pinnedProbes ?? [];
  if (!a || !b) return "Pin two probes to compare the first two in the list.";
  if ([a, b].some(p => p.sourceHash !== document.identity.structuralHash)) return "Comparison unavailable: saved probes are stale. Delete and pin again.";
  if ([a, b].some(p => graph2DPinnedProbeState(document, p) === "invalid")) return "Comparison unavailable: invalid saved coordinates.";
  const dx = b.x - a.x, dy = b.y - a.y;
  return `Δx=${dx.toPrecision(6)}, Δy=${dy.toPrecision(6)}, distance=${Math.hypot(dx, dy).toPrecision(6)}${dx === 0 ? ", slope undefined" : `, secant slope=${(dy / dx).toPrecision(6)}`}`;
}
