import { graph2DAxisCoordinate, graph2DAxisValue, graph2DWorldToScreen, resolveGraph2DViewport, type Graph2DScreenSize, type Graph2DViewport } from "./graph2dViewport";
import { isGraph2DGridOptions, type Graph2DGridOptions } from "./graph2dGridOptions";
export type Graph2DGridTick = Readonly<{ value: number; pixel: number; label: string }>;
export type Graph2DGridProjection = Readonly<{ verticalMajor: readonly Graph2DGridTick[]; horizontalMajor: readonly Graph2DGridTick[];
  verticalMinor: readonly number[]; horizontalMinor: readonly number[]; xAxis: number | null; yAxis: number | null;
  verticalSuppressed?: boolean; horizontalSuppressed?: boolean; warnings?: readonly string[] }>;
export const formatGraph2DTick = (value: number): string => value === 0 ? "0" : Number(value.toPrecision(6)).toString();
const axis = (min: number, max: number, pixels: number, scale: Graph2DViewport["xScale"], reverse = false, options?: Graph2DGridOptions, manual: number | null = null) => {
  const lo = graph2DAxisCoordinate(min, scale), hi = graph2DAxisCoordinate(max, scale);
  const project = (coordinate: number) => (reverse ? hi - coordinate : coordinate - lo) / (hi - lo) * pixels;
  const target = options?.density === "sparse" ? 160 : options?.density === "dense" ? 60 : 100;
  const raw = (hi - lo) / Math.max(2, pixels / target), base = 10 ** Math.floor(Math.log10(raw));
  const automatic = scale === "log10" && hi - lo >= 1 ? Math.max(1, Math.ceil(raw)) : (raw / base <= 1 ? 1 : raw / base <= 2 ? 2 : raw / base <= 5 ? 5 : 10) * base;
  // Keep sparse labels when a requested manual grid is unreadable; never draw a truncated prefix of it.
  const suppressed = manual !== null && ((hi - lo) / manual > 199 || manual / (hi - lo) * pixels < 6 || !Number.isSafeInteger(Math.ceil(lo / manual)) || !Number.isSafeInteger(Math.floor(hi / manual)));
  const step = manual !== null && !suppressed ? manual : automatic;
  const unresolved = !Number.isSafeInteger(Math.ceil(lo / step)) || !Number.isSafeInteger(Math.floor(hi / step));
  const major: Graph2DGridTick[] = [], minor: number[] = [];
  for (let i = Math.ceil(lo / step); !unresolved && i <= Math.floor(hi / step) && major.length < 200; i++) {
    const c = i * step, value = graph2DAxisValue(c, scale); major.push({ value, pixel: project(c), label: formatGraph2DTick(value) });
  }
  if (!suppressed && options?.minor !== false && scale === "log10" && hi - lo >= 1) {
    // New policy considers the entire legal 200-decade window before pixel filtering;
    // otherwise the raw candidate cap could erase the right-hand half of the grid.
    const candidateLimit = options ? 2000 : 1000;
    for (let power = Math.floor(lo); power <= Math.ceil(hi) && minor.length < candidateLimit; power++) for (let n = options ? 1 : 2; n <= 9 && (!options || minor.length < candidateLimit); n++) {
      const c = power + Math.log10(n); if (c > lo && c < hi) minor.push(project(c));
    }
  } else if (!suppressed && options?.minor !== false) {
    // Count attempts, not just emitted ticks: unsafe integer increments may stop changing i.
    const start = Math.ceil(lo / (step / 5)), end = Math.floor(hi / (step / 5));
    for (let count = 0, i = start; i <= end && count < 2000 && minor.length < 1000; count++, i++) {
      if (!Number.isSafeInteger(i)) break;
      if (i % 5 !== 0) minor.push(project(i * step / 5));
    }
  }
  const readable: number[] = [];
  if (options) for (const p of [...minor].sort((a, b) => a - b)) if (readable.length < 1000 && (!readable.length || p - readable[readable.length - 1] >= 4) && major.every(t => Math.abs(t.pixel - p) >= 4)) readable.push(p);
  const unresolvedMinor = !Number.isSafeInteger(Math.ceil(lo / (step / 5))) || !Number.isSafeInteger(Math.floor(hi / (step / 5)));
  return { major, minor: options ? readable : minor, suppressed, unresolved, minorOmitted: !!options && options.minor && !suppressed && (readable.length !== minor.length || unresolvedMinor),
    zero: scale !== "log10" && min <= 0 && max >= 0 ? project(0) : null };
};

/** Bounded auto polar geometry. Ellipses reflect the actual world-to-screen aspect, not fake equal units. */
export const projectGraph2DPolarGrid = (viewport: Graph2DViewport, size: Graph2DScreenSize, options?: Graph2DGridOptions) => {
  if (viewport.xScale === "log10" || viewport.yScale === "log10" || options && !isGraph2DGridOptions(options, viewport, "polar"))
    throw new TypeError("Polar grids require linear axes and Auto spacing.");
  const b = resolveGraph2DViewport(viewport, size), origin = graph2DWorldToScreen(viewport, size, { x: 0, y: 0 });
  const radius = Math.max(...[b.xMin, b.xMax].flatMap(x => [b.yMin, b.yMax].map(y => Math.hypot(x, y))));
  const unitPixels = Math.min(size.width / (b.xMax - b.xMin), size.height / (b.yMax - b.yMin));
  const raw = (options?.density === "sparse" ? 160 : options?.density === "dense" ? 60 : 100) / unitPixels;
  const base = 10 ** Math.floor(Math.log10(raw)), step = (raw / base <= 1 ? 1 : raw / base <= 2 ? 2 : raw / base <= 5 ? 5 : 10) * base;
  const rings = (spacing: number, minor: boolean) => Array.from({ length: Math.min(64, Math.floor(radius / spacing)) }, (_, i) => (i + 1) * spacing)
    .filter((r, i) => !minor || (i + 1) % 5 !== 0).map(r => ({ radius: r, cx: origin.x, cy: origin.y, rx: r / (b.xMax - b.xMin) * size.width, ry: r / (b.yMax - b.yMin) * size.height }));
  const rays = (minor: boolean) => Array.from({ length: 12 }, (_, i) => (i * 30 + (minor ? 15 : 0)) * Math.PI / 180)
    .map(theta => ({ a: origin, b: graph2DWorldToScreen(viewport, size, { x: radius * Math.cos(theta), y: radius * Math.sin(theta) }) }));
  const minor = options?.minor && step / 5 * unitPixels >= 4;
  return { majorRings: rings(step, false), minorRings: minor ? rings(step / 5, true) : [], majorRays: rays(false), minorRays: minor ? rays(true) : [],
    warnings: [...(radius / step > 64 || minor && radius / (step / 5) > 64 ? ["Polar rings omitted beyond the 64-ring layer budget."] : []),
      ...(options?.minor && !minor ? ["Polar minor subdivisions omitted below the 4-pixel readability limit."] : [])] };
};
/** Shared world-labelled ticks; log minor ticks are multiplicative, not equally spaced fake units. */
export const projectGraph2DGrid = (viewport: Graph2DViewport, size: Graph2DScreenSize, options?: Graph2DGridOptions): Graph2DGridProjection => {
  if (options && !isGraph2DGridOptions(options, viewport)) throw new TypeError("Invalid grid options for these axis scales.");
  const b = resolveGraph2DViewport(viewport, size), x = axis(b.xMin, b.xMax, size.width, b.xScale, false, options, options?.xStep), y = axis(b.yMin, b.yMax, size.height, b.yScale, true, options, options?.yStep);
  const warnings = [x.suppressed ? "Manual X spacing is too dense or numerically unresolved at this zoom; grid lines omitted, numbers use Auto. Zoom in or use Auto spacing." : "",
    y.suppressed ? "Manual Y spacing is too dense or numerically unresolved at this zoom; grid lines omitted, numbers use Auto. Zoom in or use Auto spacing." : "",
    x.unresolved ? "X Auto tick coordinates exceed numerical resolution; grid lines and numbers omitted. Widen the bounds." : "",
    y.unresolved ? "Y Auto tick coordinates exceed numerical resolution; grid lines and numbers omitted. Widen the bounds." : "",
    x.minorOmitted || y.minorOmitted ? "Some minor subdivisions are omitted at the 4-pixel readability, numerical resolution or 1000-tick budget limit." : ""].filter(Boolean);
  return { verticalMajor: x.major, horizontalMajor: y.major, verticalMinor: x.minor, horizontalMinor: y.minor, xAxis: y.zero, yAxis: x.zero,
    ...(x.suppressed || x.unresolved ? { verticalSuppressed: true } : {}), ...(y.suppressed || y.unresolved ? { horizontalSuppressed: true } : {}), ...(warnings.length ? { warnings } : {}) };
};
