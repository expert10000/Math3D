import type { AnyCurve, CurveEvalResult, CurvePoint } from "../model";
import { sampleCurveRobust, type RobustSamplingOptions } from "./sampleRobust";

export type AdaptiveSamplingOptions = RobustSamplingOptions;

export const sampleAdaptive = (curve: AnyCurve, options: AdaptiveSamplingOptions = {}): CurveEvalResult[] => {
  return sampleCurveRobust(curve, options).renderSamples;
};

export const adaptiveSamplesToRenderPoints = <TPoint extends CurvePoint>(samples: CurveEvalResult[]): TPoint[] => {
  return samples.map((row) => row.point as TPoint);
};
