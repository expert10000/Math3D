export const hasValidGeometryObjectId = (
  id: string | null | undefined,
  validIds: ReadonlySet<string>
): id is string => {
  return typeof id === "string" && id.length > 0 && validIds.has(id);
};

export const sanitizeGeometryObjectId = (
  id: string | null | undefined,
  validIds: ReadonlySet<string>
): string | null => {
  return hasValidGeometryObjectId(id, validIds) ? id : null;
};

export const sanitizeGeometryComparePair = (
  aId: string | null | undefined,
  bId: string | null | undefined,
  validIds: ReadonlySet<string>
): { aId: string | null; bId: string | null } => {
  const nextA = sanitizeGeometryObjectId(aId, validIds);
  const nextB = sanitizeGeometryObjectId(bId, validIds);
  if (nextA && nextB && nextA === nextB) {
    return { aId: nextA, bId: null };
  }
  return { aId: nextA, bId: nextB };
};

export const sanitizeGeometryPickRef = <T extends { meshKey?: string | null }>(
  pick: T | null | undefined,
  validIds: ReadonlySet<string>
): T | null => {
  if (!pick) return null;
  const meshKey = pick.meshKey ?? null;
  if (!meshKey) return pick;
  return validIds.has(meshKey) ? pick : null;
};

export const filterGeometryMeshKeyRefs = <T extends { meshKey: string }>(
  entries: T[],
  validIds: ReadonlySet<string>
): T[] => entries.filter((entry) => validIds.has(entry.meshKey));

export const filterGeometryObjectIdRefs = <T extends { objectId: string | null }>(
  entries: T[],
  validIds: ReadonlySet<string>
): T[] => entries.filter((entry) => entry.objectId == null || validIds.has(entry.objectId));

export const filterGeometrySavedSectionCurves = <T extends { objectId: string }>(
  entries: T[],
  validIds: ReadonlySet<string>
): T[] => entries.filter((entry) => validIds.has(entry.objectId));

export const filterGeometryRecordByObjectIds = <T>(
  record: Record<string, T>,
  validIds: ReadonlySet<string>
): Record<string, T> => {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (validIds.has(key)) next[key] = value;
  }
  return next;
};

export const filterGeometryDerivedProducts = <
  T extends { linkedObjectIds?: string[]; resultObjectId?: string }
>(
  entries: T[],
  validIds: ReadonlySet<string>
): T[] =>
  entries.filter((entry) => {
    const links = entry.linkedObjectIds ?? [];
    if (links.some((id) => !validIds.has(id))) return false;
    if (entry.resultObjectId && !validIds.has(entry.resultObjectId)) return false;
    return true;
  });
