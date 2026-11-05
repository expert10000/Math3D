"use strict";

const grid = document.getElementById("release-gallery-grid");
const status = document.getElementById("release-gallery-status");
const more = document.getElementById("release-gallery-more");
const search = document.getElementById("release-gallery-search");
const filters = Array.from(document.querySelectorAll("[data-filter]"));
let allItems = [];
let filter = "all";
let shown = 24;

function imagePath(folder, file) {
  return `./assets/${folder}/${encodeURIComponent(file)}`;
}

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

function makeCard(item, index) {
  const figure = document.createElement("figure");
  figure.className = "release-gallery-card";
  const link = document.createElement("a");
  link.href = item.src;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `Open full resolution image: ${item.title}`);
  const img = document.createElement("img");
  img.src = item.src;
  img.alt = `${item.title} in Math3D`;
  img.loading = index < 3 ? "eager" : "lazy";
  img.decoding = "async";
  link.append(img);
  const caption = document.createElement("figcaption");
  const title = document.createElement("strong");
  title.textContent = item.title;
  const detail = document.createElement("small");
  detail.textContent = `${item.module} · ${item.view} · ${item.runtime}`;
  caption.append(title, detail);
  figure.append(link, caption);
  return figure;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase();
  const items = allItems.filter(item =>
    (filter === "all" || item.categories.includes(filter)) &&
    (!query || `${item.title} ${item.module} ${item.view}`.toLocaleLowerCase().includes(query)));
  grid.replaceChildren(...items.slice(0, shown).map(makeCard));
  status.textContent = `${items.length} screenshot${items.length === 1 ? "" : "s"} shown in this collection`;
  more.hidden = shown >= items.length;
  for (const button of filters) button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
}

for (const button of filters) button.addEventListener("click", () => {
  filter = button.dataset.filter;
  shown = 24;
  render();
});
search.addEventListener("input", () => { shown = 24; render(); });
more.addEventListener("click", () => { shown += 24; render(); });

Promise.all([
  getJson("./assets/release-current/manifest.json"),
  getJson("./assets/release-field-current/manifest.json"),
  getJson("./assets/release-analysis-current/manifest.json"),
  getJson("./assets/release-quantum-current/capture-index.json"),
]).then(([web, field, analysis, quantum]) => {
  const browserItems = web.entries.map(entry => ({
    src: imagePath("release-current", entry.file),
    title: entry.title,
    module: entry.module,
    view: entry.view,
    runtime: "Public browser app",
    categories: entry.module === "Graphs" ? ["Graphs", "Features"] : ["Features"],
  }));
  const fieldItems = field.entries.map(entry => ({
    src: imagePath("release-field-current", entry.file),
    title: entry.title,
    module: entry.module,
    view: entry.view,
    runtime: "Desktop",
    categories: entry.view === "Analysis" ? ["Field Explorer", "Analysis"] : ["Field Explorer"],
  }));
  const analysisItems = analysis.entries.map(entry => ({
    src: imagePath("release-analysis-current", entry.file),
    title: entry.title,
    module: entry.module,
    view: `${entry.view} · ${entry.panel}${entry.fullHeight ? " · full height" : ""}`,
    runtime: entry.runtime,
    categories: ["Analysis", "Features"],
  }));
  const quantumItems = quantum.flatMap(entry => [entry.file, ...(entry.variants || [])].filter(Boolean).map(file => ({
    src: imagePath("release-quantum-current", file),
    title: file === entry.file ? entry.label : `${entry.label} · ${file.includes("volume") ? "volume" : file.includes("density") ? "density surface" : "source guidance"}`,
    module: entry.model,
    view: "Verified scene",
    runtime: "Desktop",
    categories: ["Quantum"],
  })));
  allItems = [...browserItems, ...fieldItems, ...analysisItems, ...quantumItems];
  render();
}).catch(error => { status.textContent = `Gallery unavailable: ${error.message}`; });
