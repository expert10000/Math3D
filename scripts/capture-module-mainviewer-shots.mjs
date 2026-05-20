import { _electron as electron } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "output", "module-shot-candidates");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureDir = (dirPath) => {
  mkdirSync(dirPath, { recursive: true });
};

async function clickVisibleButton(page, label) {
  const nodes = page.getByRole("button", { name: label, exact: true });
  const count = await nodes.count();
  for (let idx = 0; idx < count; idx += 1) {
    const node = nodes.nth(idx);
    if (!(await node.isVisible())) continue;
    await node.click();
    return true;
  }
  return false;
}

async function clickVisibleButtonContains(page, fragment) {
  const nodes = page.getByRole("button");
  const count = await nodes.count();
  const query = fragment.trim().toLowerCase();
  for (let idx = 0; idx < count; idx += 1) {
    const node = nodes.nth(idx);
    if (!(await node.isVisible())) continue;
    const text = ((await node.innerText()).replace(/\s+/g, " ").trim() || "").toLowerCase();
    if (!text.includes(query)) continue;
    await node.click();
    return true;
  }
  return false;
}

async function clickVisibleByTestId(page, testId) {
  const nodes = page.getByTestId(testId);
  const count = await nodes.count();
  for (let idx = 0; idx < count; idx += 1) {
    const node = nodes.nth(idx);
    if (!(await node.isVisible())) continue;
    await node.scrollIntoViewIfNeeded().catch(() => undefined);
    await node.click();
    return true;
  }
  return false;
}

async function resetState(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await wait(500);
}

async function screenshotMainViewer(page, fileName) {
  const target = page.getByTestId("main-viewer").first();
  await target.waitFor({ state: "visible", timeout: 15000 });
  const outPath = path.join(outDir, fileName);
  await target.screenshot({ path: outPath });
  return outPath;
}

async function captureSurface(page) {
  await resetState(page);
  await clickVisibleButton(page, "Surfaces");
  await wait(400);
  await clickVisibleButton(page, "L1");
  await wait(300);
  await clickVisibleButton(page, "Explicit");
  await wait(250);
  await clickVisibleButton(page, "Monkey saddle");
  await wait(800);
  await screenshotMainViewer(page, "surface-mainviewer-a.png");

  await clickVisibleButton(page, "Sinc (decay)");
  await wait(800);
  await screenshotMainViewer(page, "surface-mainviewer-b.png");
}

async function captureMesh(page) {
  await resetState(page);
  await clickVisibleButton(page, "Mesh");
  await wait(500);
  await clickVisibleButton(page, "L1");
  await wait(300);
  await clickVisibleButton(page, "Wavy torus");
  await wait(3200);
  await screenshotMainViewer(page, "mesh-mainviewer-a.png");

  await clickVisibleButton(page, "Torus knot");
  await wait(3200);
  await screenshotMainViewer(page, "mesh-mainviewer-b.png");
}

async function captureVolume(page) {
  await resetState(page);
  await clickVisibleButton(page, "Volume");
  await wait(500);
  await clickVisibleButton(page, "L1");
  await wait(300);
  await clickVisibleButton(page, "Scene");
  await wait(300);
  await clickVisibleByTestId(page, "volume-preset-card-gyroid");
  await wait(900);
  await screenshotMainViewer(page, "volume-mainviewer-a.png");

  await clickVisibleByTestId(page, "volume-preset-card-metaballs");
  await wait(900);
  await screenshotMainViewer(page, "volume-mainviewer-b.png");
}

async function captureGeometry(page) {
  await resetState(page);
  await clickVisibleButton(page, "Geometry");
  await wait(500);
  await clickVisibleButton(page, "L1");
  await wait(300);
  await clickVisibleByTestId(page, "geometry-gallery-quick-add-torus");
  await wait(800);
  await clickVisibleButton(page, "Fit scene");
  await wait(500);
  await screenshotMainViewer(page, "geometry-mainviewer-a.png");

  await clickVisibleByTestId(page, "geometry-gallery-quick-add-dodecahedron");
  await wait(800);
  await clickVisibleButton(page, "Fit scene");
  await wait(500);
  await screenshotMainViewer(page, "geometry-mainviewer-b.png");
}

async function captureTopology(page) {
  await resetState(page);
  await clickVisibleButton(page, "Topology");
  await wait(600);
  await clickVisibleButtonContains(page, "Torus square");
  await wait(600);
  await clickVisibleButton(page, "Build Quotient");
  await wait(700);
  await clickVisibleButton(page, "Realization View");
  await wait(900);
  await screenshotMainViewer(page, "topology-mainviewer-a.png");

  await clickVisibleButtonContains(page, "Klein bottle square");
  await wait(600);
  await clickVisibleButton(page, "Build Quotient");
  await wait(700);
  await clickVisibleButton(page, "Realization View");
  await wait(900);
  await screenshotMainViewer(page, "topology-mainviewer-b.png");
}

async function captureComplex(page) {
  await resetState(page);
  await clickVisibleButton(page, "Complex Analysis");
  await wait(900);
  await screenshotMainViewer(page, "complex-mainviewer-a.png");

  await clickVisibleButton(page, "Analyze");
  await wait(500);
  await screenshotMainViewer(page, "complex-mainviewer-b.png");
}

async function main() {
  ensureDir(outDir);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: ["."],
    cwd: repoRoot,
    env,
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize({ width: 1680, height: 980 });

    await captureSurface(page);
    await captureMesh(page);
    await captureVolume(page);
    await captureGeometry(page);
    await captureTopology(page);
    await captureComplex(page);

    console.log(`[capture] wrote candidates to ${outDir}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
