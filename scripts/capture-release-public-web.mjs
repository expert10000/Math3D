#!/usr/bin/env node

// Capture the deployed browser build, so release images reflect what visitors can open.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteUrl = process.env.MATH3D_RELEASE_CAPTURE_URL || "https://expert10000.github.io/Math3D/app/";
const output = resolve(process.env.MATH3D_RELEASE_CAPTURE_OUT || join(root, "apps/public-site/src/assets/release-current"));
const capturedAt = new Date().toISOString();
const entries = [];
await mkdir(output, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(15_000);
  await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId("workspace-nav-graphs").waitFor();
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });

  async function capture(file, module, title, view) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(output, file), animations: "disabled" });
    entries.push({ file, module, title, view, sourceUrl: siteUrl, capturedAt });
    process.stdout.write(`[release-gallery] ${file}\n`);
  }

  const modules = [
    ["curves", "Curves"], ["surfaces", "Surfaces"],
    ["mesh", "Mesh"], ["geometry", "Geometry"], ["volume", "Volume"],
    ["topology", "Topology"], ["complex_analysis", "Complex Analysis"],
  ];
  for (const [id, label] of modules) {
    await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    const nav = page.getByTestId(`workspace-nav-${id}`);
    if (await nav.count() !== 1) continue;
    await nav.evaluate(node => node.click());
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(`${id}-workspace.png`, label, `${label} workspace`, "Feature");
  }

  await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId("workspace-nav-graphs").click();
  await capture("graphs-workspace.png", "Graphs", "Graphs workspace", "Feature");
  await page.getByTestId("graph-gallery-open").click();
  const gallery = page.getByTestId("graph-gallery");
  await gallery.getByRole("button", { name: "All scenes", exact: true }).click();
  await gallery.locator('[data-testid^="graph-gallery-card-"]').first().waitFor();
  const cards = await gallery.locator('[data-testid^="graph-gallery-card-"]').evaluateAll(nodes =>
    nodes.map(node => ({
      id: node.getAttribute("data-testid")?.replace("graph-gallery-card-", ""),
      title: node.querySelector('button[aria-label^="Open "]')?.getAttribute("aria-label")?.replace(/^Open /, ""),
    })).filter(item => item.id && item.title));
  if (cards.length < 20) throw new Error(`Expected at least 20 graph scenes; found ${cards.length}`);
  await capture("graphs-gallery.png", "Graphs", "Graph Gallery", "Feature");
  for (const card of cards) {
    if (!await gallery.isVisible()) await page.getByTestId("graph-gallery-open").click();
    await gallery.getByRole("button", { name: "All scenes", exact: true }).click();
    await gallery.getByTestId(`graph-gallery-card-${card.id}`)
      .getByRole("button", { name: `Open ${card.title}`, exact: true }).click();
    await page.getByTestId("graph2d-plot").waitFor({ state: "visible" });
    await capture(`graph-${card.id}.png`, "Graphs", card.title, "Graph scene");
  }

  await writeFile(join(output, "manifest.json"), JSON.stringify({
    schemaVersion: 1, capturedAt, sourceUrl: siteUrl, entries,
  }, null, 2) + "\n");
  process.stdout.write(`[release-gallery] ${entries.length} screenshots captured\n`);
} finally {
  await browser.close();
}
