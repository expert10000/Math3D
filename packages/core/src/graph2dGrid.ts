import { graph2DAxisCoordinate, graph2DAxisValue, resolveGraph2DViewport, type Graph2DScreenSize, type Graph2DViewport } from "./graph2dViewport";
export type Graph2DGridTick = Readonly<{ value: number; pixel: number; label: string }>;
export type Graph2DGridProjection = Readonly<{ verticalMajor: readonly Graph2DGridTick[]; horizontalMajor: readonly Graph2DGridTick[];
  verticalMinor: readonly number[]; horizontalMinor: readonly number[]; xAxis: number | null; yAxis: number | null }>;
export const formatGraph2DTick = (value: number): string => value === 0 ? "0" : Number(value.toPrecision(6)).toString();
const axis = (min: number, max: number, pixels: number, scale: Graph2DViewport["xScale"], reverse = false) => {
  const lo = graph2DAxisCoordinate(min, scale), hi = graph2DAxisCoordinate(max, scale);
  const project = (coordinate: number) => (reverse ? hi - coordinate : coordinate - lo) / (hi - lo) * pixels;
  const raw = (hi - lo) / Math.max(2, pixels / 100), base = 10 ** Math.floor(Math.log10(raw));
  const step = scale === "log10" && hi - lo >= 1 ? Math.max(1, Math.ceil(raw)) : (raw / base <= 1 ? 1 : raw / base <= 2 ? 2 : raw / base <= 5 ? 5 : 10) * base;
  const major: Graph2DGridTick[] = [], minor: number[] = [];
  for (let i = Math.ceil(lo / step); i <= Math.floor(hi / step) && major.length < 200; i++) {
    const c = i * step, value = graph2DAxisValue(c, scale); major.push({ value, pixel: project(c), label: formatGraph2DTick(value) });
  }
  if (scale === "log10" && hi - lo >= 1) {
    for (let power = Math.floor(lo); power <= Math.ceil(hi) && minor.length < 1000; power++) for (let n = 2; n <= 9; n++) {
      const c = power + Math.log10(n); if (c > lo && c < hi) minor.push(project(c));
    }
  } else for (let i = Math.ceil(lo / (step / 5)); i <= Math.floor(hi / (step / 5)) && minor.length < 1000; i++)
    if (i % 5 !== 0) minor.push(project(i * step / 5));
  return { major, minor, zero: scale !== "log10" && min <= 0 && max >= 0 ? project(0) : null };
};
/** Shared world-labelled ticks; log minor ticks are multiplicative, not equally spaced fake units. */
export const projectGraph2DGrid = (viewport: Graph2DViewport, size: Graph2DScreenSize): Graph2DGridProjection => {
  const b = resolveGraph2DViewport(viewport, size), x = axis(b.xMin, b.xMax, size.width, b.xScale), y = axis(b.yMin, b.yMax, size.height, b.yScale, true);
  return { verticalMajor: x.major, horizontalMajor: y.major, verticalMinor: x.minor, horizontalMinor: y.minor, xAxis: y.zero, yAxis: x.zero };
};
