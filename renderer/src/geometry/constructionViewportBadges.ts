export type ConstructionViewportBadgeEntry = {
  id: string;
  type: string;
  createdAt?: number;
};

export const getConstructionViewportBadgePrefix = (type: string): string => {
  const value = type.toLowerCase();

  if (value.includes("plane")) return "P";
  if (value.includes("normal")) return "N";
  if (value === "midpoint" || value.includes("midpoint")) return "M";
  if (
    value.includes("line") ||
    value.includes("axis") ||
    value.includes("bisector") ||
    value.includes("tangent") ||
    value.includes("vector") ||
    value.includes("segment")
  ) {
    return "L";
  }
  if (value.includes("circle") || value.includes("sphere")) return "C";
  if (value.includes("point") || value.includes("vertex") || value.includes("centroid")) return "V";
  if (value.includes("box")) return "B";
  return "O";
};

export const buildConstructionViewportBadgeById = (
  entries: ConstructionViewportBadgeEntry[]
): Map<string, string> => {
  const countsByPrefix = new Map<string, number>();
  const badgeById = new Map<string, string>();
  const ordered = [...entries].sort((a, b) => {
    const at = (a.createdAt ?? 0) - (b.createdAt ?? 0);
    if (at !== 0) return at;
    return a.id.localeCompare(b.id);
  });

  for (const entry of ordered) {
    const prefix = getConstructionViewportBadgePrefix(entry.type);
    const next = (countsByPrefix.get(prefix) ?? 0) + 1;
    countsByPrefix.set(prefix, next);
    badgeById.set(entry.id, `${prefix}${next}`);
  }

  return badgeById;
};
