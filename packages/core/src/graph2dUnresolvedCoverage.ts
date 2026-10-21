export type Graph2DUnresolvedReason = "undefined" | "refinement-limit" | "residual-check" |
  "derivative-check" | "work-limit" | "coincident" | "multiple";

export type Graph2DUnresolvedInterval = Readonly<{
  min: number;
  max: number;
  reason: Graph2DUnresolvedReason;
}>;

/** Preserve a bounded, conservative map of places the numerical scan could not resolve. */
export const compactGraph2DUnresolvedIntervals = (raw: readonly Graph2DUnresolvedInterval[],
  domain: Readonly<{ min: number; max: number }>, limit = 128): readonly Graph2DUnresolvedInterval[] => {
  if (domain.min < domain.max && raw.some(item => item.reason === "work-limit" &&
    item.min <= domain.min && item.max >= domain.max))
    return [{ min: domain.min, max: domain.max, reason: "work-limit" }];
  const sorted = raw.map(item => ({ min: Math.max(domain.min, item.min),
    max: Math.min(domain.max, item.max), reason: item.reason }))
    .filter(item => Number.isFinite(item.min) && Number.isFinite(item.max) && item.min < item.max)
    .sort((a, b) => a.min - b.min || a.max - b.max || a.reason.localeCompare(b.reason));
  const merged: Graph2DUnresolvedInterval[] = [];
  for (const item of sorted) {
    const previous = merged.at(-1);
    if (previous?.reason === item.reason && item.min <= previous.max)
      merged[merged.length - 1] = { ...previous, max: Math.max(previous.max, item.max) };
    else merged.push(item);
  }
  if (merged.length <= limit) return merged;
  const tail = merged.slice(limit - 1);
  return [...merged.slice(0, limit - 1), { min: tail[0]!.min,
    max: Math.max(...tail.map(item => item.max)), reason: "multiple" }];
};
