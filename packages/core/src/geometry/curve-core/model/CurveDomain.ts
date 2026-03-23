import { isFiniteNumber } from "../../../math";

export type CurveDomain = {
  tMin: number;
  tMax: number;
  closed?: boolean;
};

export const isCurveDomain = (value: unknown): value is CurveDomain => {
  if (!value || typeof value !== "object") return false;
  const probe = value as Partial<CurveDomain>;
  if (!isFiniteNumber(probe.tMin) || !isFiniteNumber(probe.tMax)) return false;
  return probe.tMax > probe.tMin;
};

export const normalizeCurveDomain = (domain: CurveDomain): CurveDomain => {
  if (domain.tMax >= domain.tMin) return domain;
  return { ...domain, tMin: domain.tMax, tMax: domain.tMin };
};

export const curveDomainSpan = (domain: CurveDomain): number => {
  return Math.max(0, domain.tMax - domain.tMin);
};

