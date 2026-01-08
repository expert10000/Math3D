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
        console.log("[PlanePlot] drawFullGrid skipped (no content/scales)", {
          id,
          hasG: !!gContent,
          hasX: !!x,
          hasY: !!y,
        });
        return;
      }

      console.log("[PlanePlot] drawFullGrid", { id, stepLocal });

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
        console.log("[PlanePlot] no svgRef", { id });
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

      console.log("[PlanePlot] init scales", {
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

      console.log("[PlanePlot] init done", { id });

      return () => {
        svg.on(".zoom", null);
      };
    }, [id, extent, step]);

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          console.log("[PlanePlot] clear", { id });
          gContentRef.current?.selectAll("*").remove();
        },
        drawGrid(stepLocal: number) {
          console.log("[PlanePlot] drawGrid via handle", { id, stepLocal });
          drawFullGrid(stepLocal);
        },
        x(re: number) {
          const x = xScaleRef.current;
          const val = x ? x(re) : 0;
          // small log, commented to avoid spam – uncomment if needed
          // console.log("[PlanePlot] x()", { id, re, val });
          return val;
        },
        y(im: number) {
          const y = yScaleRef.current;
          const val = y ? y(im) : 0;
          // console.log("[PlanePlot] y()", { id, im, val });
          return val;
        },
        drawCurve(points: [number, number][], stroke: string) {
          const g = gContentRef.current;
          const x = xScaleRef.current;
          const y = yScaleRef.current;

          console.log("[PlanePlot] drawCurve called", {
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
            console.log("[PlanePlot] drawCurve – empty dAttr", { id });
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
        console.log("[PlanePlot] drawFullGrid skipped (no content/scales)", {
          id,
          hasG: !!gContent,
          hasX: !!x,
          hasY: !!y,
        });
        return;
      }

      console.log("[PlanePlot] drawFullGrid", { id, stepLocal });

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
        console.log("[PlanePlot] no svgRef", { id });
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

      console.log("[PlanePlot] init scales", {
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

      console.log("[PlanePlot] init done", { id });

      return () => {
        svg.on(".zoom", null);
      };
    }, [id, extent, step]);

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          console.log("[PlanePlot] clear", { id });
          gContentRef.current?.selectAll("*").remove();
        },
        drawGrid(stepLocal: number) {
          console.log("[PlanePlot] drawGrid via handle", { id, stepLocal });
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

          console.log("[PlanePlot] drawCurve called", {
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
            console.log("[PlanePlot] drawCurve – empty dAttr", { id });
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

    const isZ = id === "svgZ";

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

export type PlanePlotHandle = {
  clear(): void;
  drawGrid(step: number): void;
  x(re: number): number;
  y(im: number): number;
  drawCurve(points: [number, number][], stroke: string): void;
};

type PlanePlotProps = {
  id: string;                 // "svgZ" or "svgW"
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

    const isZ = id === "svgZ";

    // Draw grid + axes + badge into the existing content group
    const drawFullGrid = (stepLocal: number) => {
      const gContent = gContentRef.current;
      const x = xScaleRef.current;
      const y = yScaleRef.current;
      if (!gContent || !x || !y) return;

      gContent.selectAll("*").remove();

      const gGrid = gContent.append("g").attr("data-layer", "grid");

      // ----- GRID LINES (same in Z and W) -----
      for (let re = -extent; re <= extent + 1e-9; re += stepLocal) {
        gGrid
          .append("line")
          .attr("x1", x(re))
          .attr("y1", y(-extent))
          .attr("x2", x(re))
          .attr("y2", y(extent))
          .attr("stroke", "#e0e0e0")
          .attr("stroke-width", 1);
      }

      for (let im = -extent; im <= extent + 1e-9; im += stepLocal) {
        gGrid
          .append("line")
          .attr("x1", x(-extent))
          .attr("y1", y(im))
          .attr("x2", x(extent))
          .attr("y2", y(im))
          .attr("stroke", "#e0e0e0")
          .attr("stroke-width", 1);
      }

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

      // ----- tiny caption -----
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
