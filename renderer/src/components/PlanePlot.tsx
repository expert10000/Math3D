/*
// src/components/PlanePlot.tsx
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as d3 from "d3";
import { debugLog } from "../utils/debugLog";
import { scalarToColor01, type ColorPalette } from "./colorPalette";
import { scalarToColor01, type ColorPalette } from "./colorPalette";
import { scalarToColor01, type ColorPalette } from "./colorPalette";
import { scalarToColor01, type ColorPalette } from "./colorPalette";

export type PlanePlotHandle = {
  clear(): void;
  drawGrid(step: number): void;
  x(re: number): number;
  y(im: number): number;
  drawCurve(points: [number, number][], stroke: string): void;
};

type PlanePlotProps = {
  id: string;

  extent?: number;

  step?: number;

  style?: React.CSSProperties;
};

const W = 900;
const H = 320;
const m = { top: 18, right: 18, bottom: 28, left: 36 };


export const PlanePlot = forwardRef<PlanePlotHandle, PlanePlotProps>(
  ({ id, extent = 3, step = 1, style }, ref) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const gContentRef =
      useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
    const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
    const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);

    // Draw grid + axes + badge into the existing content group
    const drawFullGrid = (stepLocal: number) => {
      const gContent = gContentRef.current;
      const x = xScaleRef.current;
      const y = yScaleRef.current;
      if (!gContent || !x || !y) {
        debugLog("[PlanePlot] drawFullGrid skipped (no content/scales)", {
          id,
          hasG: !!gContent,
          hasX: !!x,
          hasY: !!y,
        });
        return;
      }

      debugLog("[PlanePlot] drawFullGrid", { id, stepLocal });

      gContent.selectAll("*").remove();

      const gGrid = gContent.append("g").attr("data-layer", "grid");

      for (let re = -extent; re <= extent + 1e-9; re += stepLocal) {
        gGrid
          .append("line")
          .attr("class", "grid-line")
          .attr("x1", x(re))
          .attr("y1", y(-extent))
          .attr("x2", x(re))
          .attr("y2", y(extent));
      }

      for (let im = -extent; im <= extent + 1e-9; im += stepLocal) {
        gGrid
          .append("line")
          .attr("class", "grid-line")
          .attr("x1", x(-extent))
          .attr("y1", y(im))
          .attr("x2", x(extent))
          .attr("y2", y(im));
      }

      // axes
      gContent
        .append("line")
        .attr("class", "axis-zero")
        .attr("x1", x(-extent))
        .attr("y1", y(0))
        .attr("x2", x(extent))
        .attr("y2", y(0));

      gContent
        .append("line")
        .attr("class", "axis-zero")
        .attr("x1", x(0))
        .attr("y1", y(-extent))
        .attr("x2", x(0))
        .attr("y2", y(extent));

      // tiny caption
      gContent
        .append("text")
        .attr("class", "badge")
        .attr("x", W - 6)
        .attr("y", H - 6)
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .attr("fill", "#666")
        .text(id === "svgZ" ? "Z-plane" : "W-plane");
    };

    useEffect(() => {
      if (!svgRef.current) {
        debugLog("[PlanePlot] no svgRef", { id });
        return;
      }

      const svg = d3
        .select<SVGSVGElement, unknown>(svgRef.current)
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      svg.selectAll("*").remove();

      const gContent = svg.append("g").attr("class", "content");
      gContentRef.current = gContent;

      // scales
      const x = d3
        .scaleLinear()
        .domain([-extent, extent])
        .range([m.left, W - m.right]);

      const y = d3
        .scaleLinear()
        .domain([extent, -extent])
        .range([m.top, H - m.bottom]);

      xScaleRef.current = x;
      yScaleRef.current = y;

      debugLog("[PlanePlot] init scales", {
        id,
        domainX: x.domain(),
        domainY: y.domain(),
      });

      // initial grid
      drawFullGrid(step);

      // zoom + pan
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 20])
        // keep this "any" so TS doesn't fight us
        .on("zoom", (ev: any) => {
          gContent.attr("transform", ev.transform);
        });

      svg.call(zoom as any);

      svg.on("dblclick", () => {
        svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
      });

      debugLog("[PlanePlot] init done", { id });

      return () => {
        svg.on(".zoom", null);
      };
    }, [id, extent, step]);

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          debugLog("[PlanePlot] clear", { id });
          gContentRef.current?.selectAll("*").remove();
        },
        drawGrid(stepLocal: number) {
          debugLog("[PlanePlot] drawGrid via handle", { id, stepLocal });
          drawFullGrid(stepLocal);
        },
        x(re: number) {
          const x = xScaleRef.current;
          const val = x ? x(re) : 0;
          // small log, commented to avoid spam – uncomment if needed
          // debugLog("[PlanePlot] x()", { id, re, val });
          return val;
        },
        y(im: number) {
          const y = yScaleRef.current;
          const val = y ? y(im) : 0;
          // debugLog("[PlanePlot] y()", { id, im, val });
          return val;
        },
        drawCurve(points: [number, number][], stroke: string) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;

          debugLog("[PlanePlot] drawCurve called", {
            id,
            stroke,
            nPoints: points.length,
            first: points[0],
            last: points[points.length - 1],
            hasG: !!g,
            hasX: !!x,
            hasY: !!y,
          });

          if (!g || !x || !y || points.length === 0) return;

          const lineGen = (d3 as any)
            .line()
            .x((d: any) => x(d[0]))
            .y((d: any) => y(d[1]));

          const dAttr = lineGen(points);
          if (!dAttr) {
            debugLog("[PlanePlot] drawCurve – empty dAttr", { id });
            return;
          }

          g.append("path")
            .attr("fill", "none")
            .attr("stroke", stroke)
            .attr("stroke-width", 1.5)
            .attr("d", dAttr);
        },
      }),
      [extent]
    );

    return (
      <svg
        id={id}
        ref={svgRef}
        style={{
          background: "#fafafa",
          border: "1px solid #ddd",
          flex: 1,
          width: "100%",
          ...style,
        }}
      />
    );
  }
);


*/
/*
// src/components/PlanePlot.tsx
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as d3 from "d3";

export type PlanePlotHandle = {
  clear(): void;
  drawGrid(step: number): void;
  x(re: number): number;
  y(im: number): number;
  drawCurve(points: [number, number][], stroke: string): void;
};

type PlanePlotProps = {
  id: string;

  extent?: number;

  step?: number;

  style?: React.CSSProperties;
};

const W = 900;
const H = 320;
const m = { top: 18, right: 18, bottom: 28, left: 36 };

export const PlanePlot = forwardRef<PlanePlotHandle, PlanePlotProps>(
  ({ id, extent = 3, step = 1, style }, ref) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const gContentRef =
      useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
    const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
    const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);

    // Draw grid + axes + badge into the existing content group
    const drawFullGrid = (stepLocal: number) => {
      const gContent = gContentRef.current;
      const x = xScaleRef.current;
      const y = yScaleRef.current;
      if (!gContent || !x || !y) {
        debugLog("[PlanePlot] drawFullGrid skipped (no content/scales)", {
          id,
          hasG: !!gContent,
          hasX: !!x,
          hasY: !!y,
        });
        return;
      }

      debugLog("[PlanePlot] drawFullGrid", { id, stepLocal });

      gContent.selectAll("*").remove();

      const gGrid = gContent.append("g").attr("data-layer", "grid");

      for (let re = -extent; re <= extent + 1e-9; re += stepLocal) {
        gGrid
          .append("line")
          .attr("class", "grid-line")
          .attr("x1", x(re))
          .attr("y1", y(-extent))
          .attr("x2", x(re))
          .attr("y2", y(extent));
      }

      for (let im = -extent; im <= extent + 1e-9; im += stepLocal) {
        gGrid
          .append("line")
          .attr("class", "grid-line")
          .attr("x1", x(-extent))
          .attr("y1", y(im))
          .attr("x2", x(extent))
          .attr("y2", y(im));
      }

      // axes
      gContent
        .append("line")
        .attr("class", "axis-zero")
        .attr("x1", x(-extent))
        .attr("y1", y(0))
        .attr("x2", x(extent))
        .attr("y2", y(0));

      gContent
        .append("line")
        .attr("class", "axis-zero")
        .attr("x1", x(0))
        .attr("y1", y(-extent))
        .attr("x2", x(0))
        .attr("y2", y(extent));

      // tiny caption
      gContent
        .append("text")
        .attr("class", "badge")
        .attr("x", W - 6)
        .attr("y", H - 6)
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .attr("fill", "#666")
        .text(id === "svgZ" ? "Z-plane" : "W-plane");
    };

    useEffect(() => {
      if (!svgRef.current) {
        debugLog("[PlanePlot] no svgRef", { id });
        return;
      }

const svg = d3
  .select<SVGSVGElement, unknown>(svgRef.current)
  .attr("viewBox", `0 0 ${W} ${H}`)
  // IMPORTANT: stretch to container, don't letter-box
  .attr("preserveAspectRatio", "none");

      svg.selectAll("*").remove();

      const gContent = svg.append("g").attr("class", "content");
      gContentRef.current = gContent;

      // --- SQUARE MATH REGION ---------------------------------
      const innerW = W - m.left - m.right;
      const innerH = H - m.top - m.bottom;
      const side = Math.min(innerW, innerH); // square side

      // center the square inside the full inner rectangle
      const offsetX = m.left + (innerW - side) / 2;
      const offsetY = m.top + (innerH - side) / 2;

      // same pixel scale in x and y ⇒ circles stay circles
      const x = d3
        .scaleLinear()
        .domain([-extent, extent])
        .range([offsetX, offsetX + side]);

      const y = d3
        .scaleLinear()
        .domain([extent, -extent]) // flipped
        .range([offsetY, offsetY + side]);
      // --------------------------------------------------------

      xScaleRef.current = x;
      yScaleRef.current = y;

      debugLog("[PlanePlot] init scales", {
        id,
        domainX: x.domain(),
        domainY: y.domain(),
        rangeX: x.range(),
        rangeY: y.range(),
      });

      // initial grid
      drawFullGrid(step);

      // zoom + pan
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 20])
        .on("zoom", (ev: any) => {
          gContent.attr("transform", ev.transform);
        });

      svg.call(zoom as any);

      svg.on("dblclick", () => {
        svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
      });

      debugLog("[PlanePlot] init done", { id });

      return () => {
        svg.on(".zoom", null);
      };
    }, [id, extent, step]);

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          debugLog("[PlanePlot] clear", { id });
          gContentRef.current?.selectAll("*").remove();
        },
        drawGrid(stepLocal: number) {
          debugLog("[PlanePlot] drawGrid via handle", { id, stepLocal });
          drawFullGrid(stepLocal);
        },
        x(re: number) {
          const x = xScaleRef.current;
          const val = x ? x(re) : 0;
          return val;
        },
        y(im: number) {
          const y = yScaleRef.current;
          const val = y ? y(im) : 0;
          return val;
        },
        drawCurve(points: [number, number][], stroke: string) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;

          debugLog("[PlanePlot] drawCurve called", {
            id,
            stroke,
            nPoints: points.length,
            first: points[0],
            last: points[points.length - 1],
            hasG: !!g,
            hasX: !!x,
            hasY: !!y,
          });

          if (!g || !x || !y || points.length === 0) return;

          const lineGen = (d3 as any)
            .line()
            .x((d: any) => x(d[0]))
            .y((d: any) => y(d[1]));

          const dAttr = lineGen(points);
          if (!dAttr) {
            debugLog("[PlanePlot] drawCurve – empty dAttr", { id });
            return;
          }

          g.append("path")
            .attr("fill", "none")
            .attr("stroke", stroke)
            .attr("stroke-width", 1.5)
            .attr("d", dAttr);
        },
      }),
      [extent]
    );

    return (
      <svg
        id={id}
        ref={svgRef}
        style={{
          background: "#fafafa",
          border: "1px solid #ddd",
          flex: 1,
          width: "100%",
          ...style,
        }}
      />
    );
  }
);
*/
/*
// src/components/PlanePlot.tsx
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as d3 from "d3";

export type PlanePlotHandle = {
  clear(): void;
  drawGrid(step: number): void;
  x(re: number): number;
  y(im: number): number;
  drawCurve(points: [number, number][], stroke: string): void;
};

type PlanePlotProps = {
  id: string;
  extent?: number;
  step?: number;
  style?: React.CSSProperties;
};

const W = 900;
const H = 320;
const m = { top: 18, right: 18, bottom: 28, left: 36 };

export const PlanePlot = forwardRef<PlanePlotHandle, PlanePlotProps>(
  ({ id, extent = 3, step = 1, style }, ref) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const gContentRef =
      useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
    const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
    const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);

    // Draw grid + axes + badge into the existing content group
    const drawFullGrid = (stepLocal: number) => {
      const gContent = gContentRef.current;
      const x = xScaleRef.current;
      const y = yScaleRef.current;
      if (!gContent || !x || !y) return;

      const isZ = id === "svgZ";

      gContent.selectAll("*").remove();

      const gGrid = gContent.append("g").attr("data-layer", "grid");

      // GRID LINES
      for (let re = -extent; re <= extent + 1e-9; re += stepLocal) {
        gGrid
          .append("line")
          .attr("x1", x(re))
          .attr("y1", y(-extent))
          .attr("x2", x(re))
          .attr("y2", y(extent))
          .attr("stroke", isZ ? "#e0e0e0" : "#dde9ff")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", isZ ? null : "4 4");
      }

      for (let im = -extent; im <= extent + 1e-9; im += stepLocal) {
        gGrid
          .append("line")
          .attr("x1", x(-extent))
          .attr("y1", y(im))
          .attr("x2", x(extent))
          .attr("y2", y(im))
          .attr("stroke", isZ ? "#e0e0e0" : "#dde9ff")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", isZ ? null : "4 4");
      }

      // AXES
      const axisColor = isZ ? "#555" : "#0a66c2";

      gContent
        .append("line")
        .attr("x1", x(-extent))
        .attr("y1", y(0))
        .attr("x2", x(extent))
        .attr("y2", y(0))
        .attr("stroke", axisColor)
        .attr("stroke-width", 1.5);

      gContent
        .append("line")
        .attr("x1", x(0))
        .attr("y1", y(-extent))
        .attr("x2", x(0))
        .attr("y2", y(extent))
        .attr("stroke", axisColor)
        .attr("stroke-width", 1.5);

      // tiny caption
      gContent
        .append("text")
        .attr("x", W - 6)
        .attr("y", H - 6)
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .attr("fill", isZ ? "#666" : "#0a66c2")
        .text(isZ ? "Z-plane" : "W-plane");
    };

    useEffect(() => {
      if (!svgRef.current) return;

      const svg = d3
        .select<SVGSVGElement, unknown>(svgRef.current)
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      svg.selectAll("*").remove();

      const gContent = svg.append("g").attr("class", "content");
      gContentRef.current = gContent;

      // scales
      const x = d3
        .scaleLinear()
        .domain([-extent, extent])
        .range([m.left, W - m.right]);

      const y = d3
        .scaleLinear()
        .domain([extent, -extent])
        .range([m.top, H - m.bottom]);

      xScaleRef.current = x;
      yScaleRef.current = y;

      // initial grid
      drawFullGrid(step);

      // zoom + pan
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 20])
        .on("zoom", (ev: any) => {
          gContent.attr("transform", ev.transform);
        });

      svg.call(zoom as any);

      svg.on("dblclick", () => {
        svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
      });

      return () => {
        svg.on(".zoom", null);
      };
    }, [id, extent, step]);

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          gContentRef.current?.selectAll("*").remove();
        },
        drawGrid(stepLocal: number) {
          drawFullGrid(stepLocal);
        },
        x(re: number) {
          const x = xScaleRef.current;
          return x ? x(re) : 0;
        },
        y(im: number) {
          const y = yScaleRef.current;
          return y ? y(im) : 0;
        },
        drawCurve(points: [number, number][], stroke: string) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;
          if (!g || !x || !y || points.length === 0) return;

          const lineGen = (d3 as any)
            .line()
            .x((d: any) => x(d[0]))
            .y((d: any) => y(d[1]));

          const dAttr = lineGen(points);
          if (!dAttr) return;

          g.append("path")
            .attr("fill", "none")
            .attr("stroke", stroke)
            .attr("stroke-width", 1.5)
            .attr("d", dAttr);
        },
      }),
      [extent]
    );

    const isZ = id.toLowerCase().startsWith("svgz");

    return (
      <svg
        id={id}
        ref={svgRef}
        style={{
          background: isZ ? "#fafafa" : "#fbfdff", // W-plane slightly bluish
          border: "1px solid #ddd",
          flex: 1,
          width: "100%",
          ...style,
        }}
      />
    );
  }
);
*/
// src/components/PlanePlot.tsx
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as d3 from "d3";
import { scalarToColor01, type ColorPalette } from "./colorPalette";

export type PlanePlotHandle = {
  clear(): void;
  drawGrid(step: number): void;
  x(re: number): number;
  y(im: number): number;
  drawCurve(
    points: [number, number][],
    stroke: string,
    opts?: {
      width?: number;
      opacity?: number;
      dash?: string;
      layer?: string;
    }
  ): void;
  drawPoints(
    points: [number, number][],
    style?: {
      color?: string;
      size?: number;
      shape?: "circle" | "square" | "diamond" | "cross" | "triangle";
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
      layer?: string;
    }
  ): void;
  drawHeatmap(opts: {
    values: ArrayLike<number>;
    nx: number;
    ny: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    palette?: ColorPalette;
    min?: number;
    max?: number;
    opacity?: number;
  }): void;
  drawComplexDomainColoring(opts: {
    re: ArrayLike<number>;
    im: ArrayLike<number>;
    nx: number;
    ny: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    opacity?: number;
    valueMode?: "log" | "linear";
  }): void;
};

type PlanePlotProps = {
  id: string;                 // "svgZ" or "svgW"
  extent?: number;
  step?: number;
  style?: React.CSSProperties;
  onClickPoint?: (pt: { re: number; im: number }, ev: MouseEvent) => void;
  onDragPoint?: (
    pt: { re: number; im: number },
    phase: "start" | "move" | "end",
    ev: MouseEvent
  ) => void;
  dragDrawEnabled?: boolean;
  domainColoring?: boolean;
  domainRings?: boolean;
  domainRays?: boolean;
  showAxes?: boolean;
  showLabels?: boolean;
};

const W = 900;
const H = 320;
const m = { top: 18, right: 18, bottom: 28, left: 36 };
const TAU = Math.PI * 2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const snapNearInteger = (v: number) => (Math.abs(v - Math.round(v)) <= 1e-9 ? Math.round(v) : v);
const formatAxisValue = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return snapNearInteger(v).toFixed(0);
  if (a >= 100) return snapNearInteger(v).toFixed(1).replace(/\.0$/, "");
  if (a >= 10) return snapNearInteger(v).toFixed(2).replace(/\.?0+$/, "");
  if (a >= 1) return snapNearInteger(v).toFixed(3).replace(/\.?0+$/, "");
  return snapNearInteger(v).toFixed(4).replace(/\.?0+$/, "");
};
const chooseMajorTickStep = (extent: number) => {
  const safeExtent = Math.max(1e-9, Math.abs(extent));
  const desired = safeExtent / 4; // ~4 labels each side
  const exp = Math.floor(Math.log10(desired));
  const base = Math.pow(10, exp);
  const candidates = [1, 2, 5, 10];
  for (const c of candidates) {
    const step = c * base;
    if (step >= desired - 1e-12) return step;
  }
  return 10 * base;
};
const buildSymmetricTicks = (extent: number, step: number) => {
  const eps = Math.max(1e-9, step * 1e-6);
  const ticks = [0];
  for (let k = 1; k < 200; k++) {
    const v = k * step;
    if (v > extent + eps) break;
    ticks.push(v, -v);
  }
  return ticks.sort((a, b) => a - b);
};

const hsvToRgb = (h: number, s: number, v: number) => {
  const hh = ((h % 1) + 1) % 1;
  const c = v * s;
  const x = c * (1 - Math.abs((hh * 6) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;

  const seg = Math.floor(hh * 6);
  switch (seg) {
    case 0: r = c; g = x; b = 0; break;
    case 1: r = x; g = c; b = 0; break;
    case 2: r = 0; g = c; b = x; break;
    case 3: r = 0; g = x; b = c; break;
    case 4: r = x; g = 0; b = c; break;
    default: r = c; g = 0; b = x; break;
  }

  return { r: r + m, g: g + m, b: b + m };
};

export const PlanePlot = forwardRef<PlanePlotHandle, PlanePlotProps>(
  (
    {
      id,
      extent = 3,
      step = 1,
      style,
      onClickPoint,
      onDragPoint,
      dragDrawEnabled = false,
      domainColoring,
      domainRings,
      domainRays,
      showAxes = true,
      showLabels = true,
    },
    ref
  ) => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const gContentRef =
      useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
    const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
    const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
    const domainConfigRef = useRef({
      domainColoring: !!domainColoring,
      domainRings: !!domainRings,
      domainRays: !!domainRays,
    });

    const isZ = id === "svgZ";

    useEffect(() => {
      domainConfigRef.current = {
        domainColoring: !!domainColoring,
        domainRings: !!domainRings,
        domainRays: !!domainRays,
      };
    }, [domainColoring, domainRings, domainRays]);

    const buildDomainImage = (width: number, height: number) => {
      if (typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(width));
      canvas.height = Math.max(1, Math.floor(height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const img = ctx.createImageData(canvas.width, canvas.height);
      const data = img.data;
      const rMax = Math.max(1e-6, extent);
      const rMin = Math.max(1e-9, rMax * 1e-3);
      const logMin = Math.log(rMin);
      const logMax = Math.log(rMax);
      const invLogRange = 1 / Math.max(1e-6, logMax - logMin);

      const w = canvas.width;
      const h = canvas.height;
      const reSpan = extent * 2;
      const imSpan = extent * 2;

      let idx = 0;
      for (let j = 0; j < h; j++) {
        const im = extent - ((j + 0.5) / h) * imSpan;
        for (let i = 0; i < w; i++) {
          const re = -extent + ((i + 0.5) / w) * reSpan;
          const r = Math.hypot(re, im);
          const logR = Math.log(r + 1e-9);
          let v = (logR - logMin) * invLogRange;
          v = clamp01(v);
          v = 0.15 + 0.85 * v;
          const h01 = ((Math.atan2(im, re) / TAU) + 1) % 1;
          const rgb = hsvToRgb(h01, 1, v);
          data[idx++] = Math.round(rgb.r * 255);
          data[idx++] = Math.round(rgb.g * 255);
          data[idx++] = Math.round(rgb.b * 255);
          data[idx++] = 255;
        }
      }

      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL();
    };

    const buildHeatmapImage = (opts: {
      values: ArrayLike<number>;
      nx: number;
      ny: number;
      min?: number;
      max?: number;
      palette?: ColorPalette;
    }) => {
      if (typeof document === "undefined") return null;
      const nx = Math.max(1, Math.floor(opts.nx));
      const ny = Math.max(1, Math.floor(opts.ny));
      if (!opts.values || opts.values.length < nx * ny) return null;

      const canvas = document.createElement("canvas");
      canvas.width = nx;
      canvas.height = ny;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      let min = Number.isFinite(opts.min) ? (opts.min as number) : Infinity;
      let max = Number.isFinite(opts.max) ? (opts.max as number) : -Infinity;
      if (!Number.isFinite(opts.min) || !Number.isFinite(opts.max)) {
        for (let i = 0; i < nx * ny; i++) {
          const v = Number(opts.values[i]);
          if (!Number.isFinite(v)) continue;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      if (Math.abs(max - min) < 1e-9) {
        max = min + 1;
      }
      const invRange = 1 / (max - min);
      const palette = opts.palette ?? "blueRed";

      const img = ctx.createImageData(nx, ny);
      const data = img.data;
      let idx = 0;
      for (let j = 0; j < ny; j++) {
        const srcRow = ny - 1 - j;
        const rowOffset = srcRow * nx;
        for (let i = 0; i < nx; i++) {
          const v = Number(opts.values[rowOffset + i]);
          if (!Number.isFinite(v)) {
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
            continue;
          }
          let t = (v - min) * invRange;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const rgb = scalarToColor01(t, palette);
          data[idx++] = Math.round(rgb.r * 255);
          data[idx++] = Math.round(rgb.g * 255);
          data[idx++] = Math.round(rgb.b * 255);
          data[idx++] = 255;
        }
      }

      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL();
    };

    const buildComplexDomainImage = (opts: {
      re: ArrayLike<number>;
      im: ArrayLike<number>;
      nx: number;
      ny: number;
      valueMode?: "log" | "linear";
    }) => {
      if (typeof document === "undefined") return null;
      const nx = Math.max(1, Math.floor(opts.nx));
      const ny = Math.max(1, Math.floor(opts.ny));
      if (!opts.re || !opts.im || opts.re.length < nx * ny || opts.im.length < nx * ny) return null;

      const canvas = document.createElement("canvas");
      canvas.width = nx;
      canvas.height = ny;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const img = ctx.createImageData(nx, ny);
      const data = img.data;

      const mags: number[] = [];
      for (let i = 0; i < nx * ny; i++) {
        const rr = Number(opts.re[i]);
        const ii = Number(opts.im[i]);
        if (!Number.isFinite(rr) || !Number.isFinite(ii)) continue;
        const mag = Math.hypot(rr, ii);
        if (Number.isFinite(mag)) mags.push(mag);
      }
      if (!mags.length) return null;

      const maxMag = Math.max(...mags, 1e-9);
      const logMax = Math.log(1 + maxMag);
      const valueMode = opts.valueMode ?? "log";
      let idx = 0;

      for (let j = 0; j < ny; j++) {
        const srcRow = ny - 1 - j;
        const rowOffset = srcRow * nx;
        for (let i = 0; i < nx; i++) {
          const rr = Number(opts.re[rowOffset + i]);
          const ii = Number(opts.im[rowOffset + i]);
          if (!Number.isFinite(rr) || !Number.isFinite(ii)) {
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
            data[idx++] = 0;
            continue;
          }
          const mag = Math.hypot(rr, ii);
          const hue = ((Math.atan2(ii, rr) / TAU) + 1) % 1;
          const rawValue =
            valueMode === "linear"
              ? mag / Math.max(1e-9, maxMag)
              : Math.log(1 + mag) / Math.max(1e-9, logMax);
          const value = clamp01(0.12 + 0.88 * rawValue);
          const rgb = hsvToRgb(hue, 1, value);
          data[idx++] = Math.round(rgb.r * 255);
          data[idx++] = Math.round(rgb.g * 255);
          data[idx++] = Math.round(rgb.b * 255);
          data[idx++] = 255;
        }
      }

      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL();
    };

    // Draw grid + axes + badge into the existing content group
    const drawFullGrid = (stepLocal: number) => {
      const gContent = gContentRef.current;
      const x = xScaleRef.current;
      const y = yScaleRef.current;
      if (!gContent || !x || !y) return;

      gContent.selectAll("*").remove();

      const domainCfg = domainConfigRef.current;
      const showDomain = !isZ && domainCfg.domainColoring;

      if (showDomain) {
        const x0 = x(-extent);
        const x1 = x(extent);
        const y0 = y(extent);
        const y1 = y(-extent);
        const width = Math.max(1, x1 - x0);
        const height = Math.max(1, y1 - y0);
        const dataUrl = buildDomainImage(width, height);
        if (dataUrl) {
          gContent
            .append("image")
            .attr("data-layer", "domain")
            .attr("x", x0)
            .attr("y", y0)
            .attr("width", width)
            .attr("height", height)
            .attr("href", dataUrl)
            .attr("opacity", 0.95)
            .style("pointer-events", "none");
        }
      }

      const gGrid = gContent.append("g").attr("data-layer", "grid");
      const gridStroke = showDomain ? "#ffffff" : "#e0e0e0";
      const gridOpacity = showDomain ? 0.35 : 1;

      // ----- GRID LINES (same in Z and W) -----
      for (let re = -extent; re <= extent + 1e-9; re += stepLocal) {
        gGrid
          .append("line")
          .attr("x1", x(re))
          .attr("y1", y(-extent))
          .attr("x2", x(re))
          .attr("y2", y(extent))
          .attr("stroke", gridStroke)
          .attr("stroke-opacity", gridOpacity)
          .attr("stroke-width", 1);
      }

      for (let im = -extent; im <= extent + 1e-9; im += stepLocal) {
        gGrid
          .append("line")
          .attr("x1", x(-extent))
          .attr("y1", y(im))
          .attr("x2", x(extent))
          .attr("y2", y(im))
          .attr("stroke", gridStroke)
          .attr("stroke-opacity", gridOpacity)
          .attr("stroke-width", 1);
      }

      if (showDomain && (domainCfg.domainRings || domainCfg.domainRays)) {
        const gContours = gContent.append("g").attr("data-layer", "domain-contours");
        const cx = x(0);
        const cy = y(0);

        if (domainCfg.domainRings) {
          const ringCount = 6;
          const rMax = Math.max(1e-6, extent);
          const rMin = Math.max(1e-9, rMax * 1e-3);
          const logMin = Math.log(rMin);
          const logMax = Math.log(rMax);
          for (let i = 0; i < ringCount; i++) {
            const t = ringCount === 1 ? 0 : i / (ringCount - 1);
            const r = Math.exp(logMin + t * (logMax - logMin));
            const rx = Math.abs(x(r) - x(0));
            const ry = Math.abs(y(r) - y(0));
            gContours
              .append("ellipse")
              .attr("cx", cx)
              .attr("cy", cy)
              .attr("rx", rx)
              .attr("ry", ry)
              .attr("fill", "none")
              .attr("stroke", "#000")
              .attr("stroke-opacity", 0.25)
              .attr("stroke-width", 0.9)
              .attr("stroke-dasharray", "4 4")
              .style("pointer-events", "none");
          }
        }

        if (domainCfg.domainRays) {
          const rayCount = 12;
          for (let k = 0; k < rayCount; k++) {
            const theta = (k / rayCount) * TAU;
            const re = extent * Math.cos(theta);
            const im = extent * Math.sin(theta);
            gContours
              .append("line")
              .attr("x1", cx)
              .attr("y1", cy)
              .attr("x2", x(re))
              .attr("y2", y(im))
              .attr("stroke", "#000")
              .attr("stroke-opacity", 0.22)
              .attr("stroke-width", 0.9)
              .attr("stroke-dasharray", "4 4")
              .style("pointer-events", "none");
          }
        }
      }

      if (showAxes) {
        // ----- AXES (color depends on plane) -----
        const axisColor = isZ ? "#555" : "#0a66c2";

        gContent
          .append("line")
          .attr("x1", x(-extent))
          .attr("y1", y(0))
          .attr("x2", x(extent))
          .attr("y2", y(0))
          .attr("stroke", axisColor)
          .attr("stroke-width", 1.5);

        gContent
          .append("line")
          .attr("x1", x(0))
          .attr("y1", y(-extent))
          .attr("x2", x(0))
          .attr("y2", y(extent))
          .attr("stroke", axisColor)
          .attr("stroke-width", 1.5);
      }

      if (showLabels) {
        if (showAxes) {
          const axisColor = isZ ? "#4b5563" : "#075985";
          const majorStep = chooseMajorTickStep(extent);
          const ticks = buildSymmetricTicks(extent, majorStep);
          const gTicks = gContent.append("g").attr("data-layer", "axis-ticks");
          for (const t of ticks) {
            const tx = x(t);
            const ty = y(t);
            const label = formatAxisValue(t);

            // tick marks on horizontal axis (imag=0), labels below axis
            gTicks
              .append("line")
              .attr("x1", tx)
              .attr("y1", y(0) - 3)
              .attr("x2", tx)
              .attr("y2", y(0) + 3)
              .attr("stroke", axisColor)
              .attr("stroke-opacity", 0.85)
              .attr("stroke-width", 1);
            gTicks
              .append("text")
              .attr("x", tx)
              .attr("y", y(0) + 14)
              .attr("text-anchor", "middle")
              .attr("font-size", 10)
              .attr("fill", axisColor)
              .attr("opacity", 0.9)
              .text(label);

            // tick marks on vertical axis (real=0), labels to the left (skip origin duplicate)
            gTicks
              .append("line")
              .attr("x1", x(0) - 3)
              .attr("y1", ty)
              .attr("x2", x(0) + 3)
              .attr("y2", ty)
              .attr("stroke", axisColor)
              .attr("stroke-opacity", 0.85)
              .attr("stroke-width", 1);
            if (Math.abs(t) > 1e-12) {
              gTicks
                .append("text")
                .attr("x", x(0) - 6)
                .attr("y", ty + 3)
                .attr("text-anchor", "end")
                .attr("font-size", 10)
                .attr("fill", axisColor)
                .attr("opacity", 0.9)
                .text(label);
            }
          }
        }

        // ----- tiny caption -----
        gContent
          .append("text")
          .attr("x", W - 6)
          .attr("y", H - 6)
          .attr("text-anchor", "end")
          .attr("font-size", 10)
          .attr("fill", isZ ? "#666" : "#0a66c2")
          .text(isZ ? "Z-plane" : "W-plane");
      }
    };

    useEffect(() => {
      if (!svgRef.current) return;

      const svg = d3
        .select<SVGSVGElement, unknown>(svgRef.current)
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      svg.selectAll("*").remove();

      const gContent = svg.append("g").attr("class", "content");
      gContentRef.current = gContent;

      // scales
      const x = d3
        .scaleLinear()
        .domain([-extent, extent])
        .range([m.left, W - m.right]);

      const y = d3
        .scaleLinear()
        .domain([extent, -extent])
        .range([m.top, H - m.bottom]);

      xScaleRef.current = x;
      yScaleRef.current = y;

      // initial grid
      drawFullGrid(step);

      // zoom + pan
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 20])
        .filter((ev: any) => {
          if (dragDrawEnabled && ev?.type === "mousedown") {
            return false;
          }
          return (!ev.ctrlKey || ev.type === "wheel") && !ev.button;
        })
        .on("zoom", (ev: any) => {
          gContent.attr("transform", ev.transform);
        });

      svg.call(zoom as any);

      svg.on("dblclick", () => {
        svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
      });

      if (onClickPoint) {
        svg.on("click", (ev: MouseEvent) => {
          const x = xScaleRef.current;
          const y = yScaleRef.current;
          if (!x || !y) return;
          const svgNode = svgRef.current;
          if (!svgNode) return;
          const [sx, sy] = d3.pointer(ev, svgNode);
          const t = d3.zoomTransform(svgNode as any);
          const [cx, cy] = t.invert([sx, sy]);
          const re = x.invert(cx);
          const im = y.invert(cy);
          onClickPoint({ re, im }, ev);
        });
      } else {
        svg.on("click", null);
      }

      let dragActive = false;
      const toComplexPoint = (ev: MouseEvent) => {
        const x = xScaleRef.current;
        const y = yScaleRef.current;
        const svgNode = svgRef.current;
        if (!x || !y || !svgNode) return null;
        const [sx, sy] = d3.pointer(ev, svgNode);
        const t = d3.zoomTransform(svgNode as any);
        const [cx, cy] = t.invert([sx, sy]);
        const re = x.invert(cx);
        const im = y.invert(cy);
        return { re, im };
      };

      const handleWindowMouseUp = (ev: MouseEvent) => {
        if (!dragActive || !onDragPoint) return;
        dragActive = false;
        const pt = toComplexPoint(ev);
        if (!pt) return;
        onDragPoint(pt, "end", ev);
      };

      if (onDragPoint) {
        svg.on("mousedown.dragdraw", (ev: MouseEvent) => {
          if (ev.button !== 0) return;
          const pt = toComplexPoint(ev);
          if (!pt) return;
          dragActive = true;
          onDragPoint(pt, "start", ev);
          if (dragDrawEnabled) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        });
        svg.on("mousemove.dragdraw", (ev: MouseEvent) => {
          if (!dragActive) return;
          const pt = toComplexPoint(ev);
          if (!pt) return;
          onDragPoint(pt, "move", ev);
          if (dragDrawEnabled) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        });
        window.addEventListener("mouseup", handleWindowMouseUp);
      } else {
        svg.on("mousedown.dragdraw", null);
        svg.on("mousemove.dragdraw", null);
      }

      return () => {
        svg.on(".zoom", null);
        svg.on("click", null);
        svg.on("mousedown.dragdraw", null);
        svg.on("mousemove.dragdraw", null);
        window.removeEventListener("mouseup", handleWindowMouseUp);
      };
    }, [id, extent, step, onClickPoint, onDragPoint, dragDrawEnabled, showAxes, showLabels]);

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          gContentRef.current?.selectAll("*").remove();
        },
        drawGrid(stepLocal: number) {
          drawFullGrid(stepLocal);
        },
        x(re: number) {
          const x = xScaleRef.current;
          return x ? x(re) : 0;
        },
        y(im: number) {
          const y = yScaleRef.current;
          return y ? y(im) : 0;
        },
        drawCurve(
          points: [number, number][],
          stroke: string,
          opts?: { width?: number; opacity?: number; dash?: string; layer?: string }
        ) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;
          if (!g || !x || !y || points.length === 0) return;

          const lineGen = (d3 as any)
            .line()
            .x((d: any) => x(d[0]))
            .y((d: any) => y(d[1]));

          const dAttr = lineGen(points);
          if (!dAttr) return;
          const layerId = opts?.layer;
          const target = layerId
            ? (g.selectAll(`g[data-layer="${layerId}"]`).empty()
              ? g.append("g").attr("data-layer", layerId)
              : g.select(`g[data-layer="${layerId}"]`))
            : g;

          const path = target
            .append("path")
            .attr("fill", "none")
            .attr("stroke", stroke)
            .attr("stroke-width", opts?.width ?? 1.5)
            .attr("stroke-opacity", opts?.opacity ?? 1)
            .attr("d", dAttr);
          if (opts?.dash) {
            path.attr("stroke-dasharray", opts.dash);
          }
        },
        drawPoints(
          points: [number, number][],
          style?: {
            color?: string;
            size?: number;
            shape?: "circle" | "square" | "diamond" | "cross" | "triangle";
            stroke?: string;
            strokeWidth?: number;
            opacity?: number;
            layer?: string;
          }
        ) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;
          if (!g || !x || !y) return;

          const layerId = style?.layer ?? "points";
          g.selectAll(`g[data-layer="${layerId}"]`).remove();
          if (!points.length) return;

          const group = g.append("g").attr("data-layer", layerId).style("pointer-events", "none");
          const color = style?.color ?? "#d14d00";
          const stroke = style?.stroke ?? "#000";
          const strokeWidth = style?.strokeWidth ?? 0.6;
          const opacity = style?.opacity ?? 0.95;
          const size = Math.max(1, style?.size ?? 4);

          const shape = style?.shape ?? "circle";
          if (shape === "circle") {
            group
              .selectAll("circle")
              .data(points)
              .enter()
              .append("circle")
              .attr("cx", (d) => x(d[0]))
              .attr("cy", (d) => y(d[1]))
              .attr("r", size)
              .attr("fill", color)
              .attr("stroke", stroke)
              .attr("stroke-width", strokeWidth)
              .attr("fill-opacity", opacity);
            return;
          }

          const symbolType =
            shape === "square"
              ? (d3.symbolSquare as any)
              : shape === "diamond"
              ? (d3.symbolDiamond as any)
              : shape === "triangle"
              ? (d3.symbolTriangle as any)
              : (d3.symbolCross as any);

          const symbol = (d3 as any).symbol().type(symbolType).size(size * size * 2.2);
          group
            .selectAll("path")
            .data(points)
            .enter()
            .append("path")
            .attr("d", symbol as any)
            .attr("transform", (d) => `translate(${x(d[0])},${y(d[1])})`)
            .attr("fill", color)
            .attr("stroke", stroke)
            .attr("stroke-width", strokeWidth)
            .attr("fill-opacity", opacity);
        },
        drawHeatmap(opts: {
          values: ArrayLike<number>;
          nx: number;
          ny: number;
          xMin: number;
          xMax: number;
          yMin: number;
          yMax: number;
          palette?: ColorPalette;
          min?: number;
          max?: number;
          opacity?: number;
        }) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;
          if (!g || !x || !y) return;

          g.selectAll(`image[data-layer="heatmap"]`).remove();
          const dataUrl = buildHeatmapImage(opts);
          if (!dataUrl) return;

          const x0 = x(opts.xMin);
          const x1 = x(opts.xMax);
          const y0 = y(opts.yMax);
          const y1 = y(opts.yMin);
          const width = Math.max(1, x1 - x0);
          const height = Math.max(1, y1 - y0);
          const opacity = opts.opacity ?? 0.75;

          const ref = g.select(`g[data-layer="grid"]`);
          if (!ref.empty()) {
            g.insert("image", 'g[data-layer="grid"]')
              .attr("data-layer", "heatmap")
              .attr("x", x0)
              .attr("y", y0)
              .attr("width", width)
              .attr("height", height)
              .attr("href", dataUrl)
              .attr("opacity", opacity)
              .style("pointer-events", "none");
            return;
          }

          g.append("image")
            .attr("data-layer", "heatmap")
            .attr("x", x0)
            .attr("y", y0)
            .attr("width", width)
            .attr("height", height)
            .attr("href", dataUrl)
            .attr("opacity", opacity)
            .style("pointer-events", "none");
        },
        drawComplexDomainColoring(opts: {
          re: ArrayLike<number>;
          im: ArrayLike<number>;
          nx: number;
          ny: number;
          xMin: number;
          xMax: number;
          yMin: number;
          yMax: number;
          opacity?: number;
          valueMode?: "log" | "linear";
        }) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;
          if (!g || !x || !y) return;

          g.selectAll(`image[data-layer="complex-domain"]`).remove();
          const dataUrl = buildComplexDomainImage({
            re: opts.re,
            im: opts.im,
            nx: opts.nx,
            ny: opts.ny,
            valueMode: opts.valueMode,
          });
          if (!dataUrl) return;

          const x0 = x(opts.xMin);
          const x1 = x(opts.xMax);
          const y0 = y(opts.yMax);
          const y1 = y(opts.yMin);
          const width = Math.max(1, x1 - x0);
          const height = Math.max(1, y1 - y0);
          const opacity = opts.opacity ?? 0.96;

          const ref = g.select(`g[data-layer="grid"]`);
          if (!ref.empty()) {
            g.insert("image", 'g[data-layer="grid"]')
              .attr("data-layer", "complex-domain")
              .attr("x", x0)
              .attr("y", y0)
              .attr("width", width)
              .attr("height", height)
              .attr("href", dataUrl)
              .attr("opacity", opacity)
              .style("pointer-events", "none");
            return;
          }

          g.append("image")
            .attr("data-layer", "complex-domain")
            .attr("x", x0)
            .attr("y", y0)
            .attr("width", width)
            .attr("height", height)
            .attr("href", dataUrl)
            .attr("opacity", opacity)
            .style("pointer-events", "none");
        },
      }),
      [extent]
    );

    return (
      <svg
        id={id}
        ref={svgRef}
        style={{
          background: "#fafafa", // SAME for Z and W
          border: "1px solid #ddd",
          flex: 1,
          width: "100%",
          ...style,
        }}
      />
    );
  }
);
