import * as d3 from "d3";
const data = [4, 8, 15, 16, 23, 42];
const width = 640;
const height = 240;
const margin = { top: 10, right: 10, bottom: 20, left: 30 };
const svg = d3.select("#chart")
    .attr("width", width)
    .attr("height", height);
const x = d3.scaleBand()
    .domain(d3.range(data.length).map(String))
    .range([margin.left, width - margin.right])
    .padding(0.1);
const y = d3.scaleLinear()
    .domain([0, d3.max(data)]).nice()
    .range([height - margin.bottom, margin.top]);
svg.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (_, i) => x(String(i)))
    .attr("y", d => y(d))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d));
const xAxis = d3.axisBottom(x);
const yAxis = d3.axisLeft(y).ticks(5);
svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis);
svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis);
//# sourceMappingURL=render.js.map