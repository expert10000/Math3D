import { resolveGraph2DViewport, type Graph2DScreenSize, type Graph2DViewport } from "@math3d/core";

export type Graph2DGridTick = Readonly<{ value: number; pixel: number; label: string }>;
export type Graph2DGridProjection = Readonly<{
  verticalMajor: readonly Graph2DGridTick[];
  horizontalMajor: readonly Graph2DGridTick[];
  verticalMinor: readonly number[];
  horizontalMinor: readonly number[];
  xAxis: number | null;
  yAxis: number | null;
}>;

const niceStep = (raw: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
};
export const formatGraph2DTick = (value: number): string =>
  Math.abs(value) < 1e-12 ? "0" : Number(value.toPrecision(6)).toString();

const ticks = (min: number, max: number, step: number, project: (value: number) => number): Graph2DGridTick[] => {
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  const output: Graph2DGridTick[] = [];
  for (let index = first; index <= last && output.length < 200; index += 1) {
    const value = index * step;
    output.push({ value, pixel: project(value), label: formatGraph2DTick(value) });
  }
  return output;
};
const minorTicks = (min: number, max: number, step: number, project: (value: number) => number): number[] => {
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  const output: number[] = [];
  for (let index = first; index <= last && output.length < 1000; index += 1) {
    if (index % 5 !== 0) output.push(project(index * step));
  }
  return output;
};

export const projectGraph2DGrid = (viewport: Graph2DViewport, size: Graph2DScreenSize): Graph2DGridProjection => {
  const bounds = resolveGraph2DViewport(viewport, size);
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const xStep = niceStep(xSpan / Math.max(2, size.width / 100));
  const yStep = niceStep(ySpan / Math.max(2, size.height / 80));
  const x = (value: number) => (value - bounds.xMin) / xSpan * size.width;
  const y = (value: number) => (bounds.yMax - value) / ySpan * size.height;
  return {
    verticalMajor: ticks(bounds.xMin, bounds.xMax, xStep, x),
    horizontalMajor: ticks(bounds.yMin, bounds.yMax, yStep, y),
    verticalMinor: minorTicks(bounds.xMin, bounds.xMax, xStep / 5, x),
    horizontalMinor: minorTicks(bounds.yMin, bounds.yMax, yStep / 5, y),
    xAxis: bounds.yMin <= 0 && bounds.yMax >= 0 ? y(0) : null,
    yAxis: bounds.xMin <= 0 && bounds.xMax >= 0 ? x(0) : null,
  };
};
