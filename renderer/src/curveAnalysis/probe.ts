import type { CurveDifferentialPoint } from "@math3d/core";
import type { CurveIdentity } from "./contracts";

export type CurvePickSource = "viewport" | "parameter-slider" | "arc-length-slider" | "plot" | "diagnostic" | "replay";

export type SemanticCurvePick = {
  id: string;
  identity: CurveIdentity;
  t: number;
  normalizedParameter: number;
  arcLength: number;
  normalizedArcLength: number;
  segmentIndex: number;
  span: readonly [number, number];
  worldPoint: readonly [number, number, number];
  source: CurvePickSource;
  sourceMapping: string;
  speed: number | null;
  curvature: number | null;
  signedCurvature: number | null;
  torsion: number | null;
  radiusOfCurvature: number | null;
  tangent: readonly [number, number, number] | null;
  normal: readonly [number, number, number] | null;
  binormal: readonly [number, number, number] | null;
  frameKind: "frenet" | "bishop" | "unavailable";
  createdAt: number;
};

const tuple = (value: { x: number; y: number; z: number } | null): readonly [number, number, number] | null =>
  value ? [value.x, value.y, value.z] : null;

export const createSemanticCurvePick = (input: {
  identity: CurveIdentity;
  point: CurveDifferentialPoint;
  pointIndex: number;
  parameterSpan: readonly [number, number];
  source: CurvePickSource;
  createdAt?: number;
}): SemanticCurvePick => ({
  id: `${input.identity.key}:probe:${input.point.t}:${input.createdAt ?? Date.now()}`,
  identity: input.identity,
  t: input.point.t,
  normalizedParameter: input.point.normalizedParameter,
  arcLength: input.point.arcLength,
  normalizedArcLength: input.point.normalizedArcLength,
  segmentIndex: Math.max(0, input.pointIndex - 1),
  span: input.parameterSpan,
  worldPoint: [input.point.position.x, input.point.position.y, input.point.position.z],
  source: input.source,
  sourceMapping: `${input.source} -> curve parameter -> arc-length table`,
  speed: input.point.speed,
  curvature: input.point.curvature,
  signedCurvature: input.point.signedCurvature,
  torsion: input.point.torsion,
  radiusOfCurvature: input.point.radiusOfCurvature,
  tangent: tuple(input.point.tangent),
  normal: tuple(input.point.frenetNormal ?? input.point.bishopNormal),
  binormal: tuple(input.point.frenetBinormal ?? input.point.bishopBinormal),
  frameKind: input.point.frenetDefined ? "frenet" : input.point.bishopNormal ? "bishop" : "unavailable",
  createdAt: input.createdAt ?? Date.now(),
});

export const curvePickIsStale = (pick: SemanticCurvePick, identity: CurveIdentity): boolean =>
  pick.identity.curveId !== identity.curveId || pick.identity.curveRevision !== identity.curveRevision;

export const curvePickToCsv = (picks: readonly SemanticCurvePick[]): string => {
  const header = "id,curveId,revision,t,u,s,sNormalized,x,y,z,speed,curvature,signedCurvature,torsion,radius,frame,source,stale";
  const rows = picks.map((pick) => [
    pick.id, pick.identity.curveId, pick.identity.curveRevision, pick.t, pick.normalizedParameter, pick.arcLength,
    pick.normalizedArcLength, ...pick.worldPoint, pick.speed ?? "", pick.curvature ?? "", pick.signedCurvature ?? "",
    pick.torsion ?? "", pick.radiusOfCurvature ?? "", pick.frameKind, pick.source, "",
  ].map((value) => JSON.stringify(value)).join(","));
  return [header, ...rows].join("\n");
};

export const curvePickComparison = (left: SemanticCurvePick, right: SemanticCurvePick) => ({
  deltaParameter: right.t - left.t,
  deltaArcLength: right.arcLength - left.arcLength,
  distance: Math.hypot(
    right.worldPoint[0] - left.worldPoint[0],
    right.worldPoint[1] - left.worldPoint[1],
    right.worldPoint[2] - left.worldPoint[2]
  ),
  deltaCurvature: left.curvature == null || right.curvature == null ? null : right.curvature - left.curvature,
  deltaTorsion: left.torsion == null || right.torsion == null ? null : right.torsion - left.torsion,
});
