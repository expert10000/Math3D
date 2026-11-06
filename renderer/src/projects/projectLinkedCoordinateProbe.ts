import { sameProjectCoordinateFrame, type ProjectCoordinateFrameRead, type ProjectNoteAnchor } from "@math3d/core";

export type CoordinateProbeMember = Readonly<{
  id: string;
  revision: number;
  hash: string;
  slot?: 0 | 1;
  coordinates: ProjectCoordinateFrameRead;
  param?: unknown;
}>;

export type CoordinateProbePick = Readonly<{
  memberId: string;
  revision: number;
  hash: string;
  meshKey?: string;
  faceIndex?: number;
  point: Readonly<{ x: number; y: number; z: number }>;
}>;

/** A transient view reference. Source elements stay local; only a declared coordinate is shared. */
export type LinkedCoordinateProbe = Readonly<{
  source: Readonly<{ id: string; revision: number; hash: string; slot: 0 | 1; meshKey?: string; faceIndex?: number }>;
  target: Readonly<{ id: string; revision: number; hash: string; slot: 0 | 1 }>;
  point: CoordinateProbePick["point"];
  frame: string;
  unit: string;
  axes: readonly [string, string, string];
  handedness: "right" | "left";
}>;

export const resolveLinkedCoordinateProbe = (
  members: readonly CoordinateProbeMember[], pick: CoordinateProbePick | null,
): LinkedCoordinateProbe | null => {
  if (!pick || members.length !== 2 || members.some(member => member.coordinates.status !== "declared" || !member.coordinates.value)) return null;
  const [a, b] = members;
  if (a!.slot === undefined || b!.slot === undefined || a!.slot === b!.slot ||
    !sameProjectCoordinateFrame(a!.coordinates.value!, b!.coordinates.value!)) return null;
  if (![pick.point.x, pick.point.y, pick.point.z].every(Number.isFinite)) return null;
  const source = members.find(member => member.id === pick.memberId && member.revision === pick.revision && member.hash === pick.hash);
  if (!source) return null;
  const target = source === a ? b! : a!;
  const frame = source.coordinates.value!;
  return {
    source: { id: source.id, revision: source.revision, hash: source.hash, slot: source.slot!,
      ...(pick.meshKey ? { meshKey: pick.meshKey } : {}), ...(pick.faceIndex !== undefined ? { faceIndex: pick.faceIndex } : {}) },
    target: { id: target.id, revision: target.revision, hash: target.hash, slot: target.slot! },
    point: { ...pick.point }, frame: frame.frame, unit: frame.unit, axes: frame.axes, handedness: frame.handedness,
  };
};

/** Reconstructs a saved Note's marker only from its two currently verified generations. */
export const resolveSavedCoordinateProbe = (members: readonly CoordinateProbeMember[],
  anchor: Extract<ProjectNoteAnchor, { kind: "comparison" }>): LinkedCoordinateProbe | null => {
  const stored = anchor.coordinateProbe;
  if (!stored || members.length !== 2 || anchor.members.some((identity, index) =>
    members[index]?.id !== identity.id || members[index]?.revision !== identity.revision ||
    members[index]?.hash !== identity.structuralHash)) return null;
  const slot = stored.sourceSlot === "A" ? 0 : 1;
  const source = members[slot]!;
  const linked = resolveLinkedCoordinateProbe(members, { memberId: source.id, revision: source.revision, hash: source.hash,
    point: { x: stored.point[0], y: stored.point[1], z: stored.point[2] } });
  if (!linked || linked.source.slot !== slot || !sameProjectCoordinateFrame(stored.coordinateFrame,
    { format: "math3d.coordinate-frame/v1", frame: linked.frame, unit: linked.unit, axes: linked.axes,
      handedness: linked.handedness })) return null;
  return linked;
};
