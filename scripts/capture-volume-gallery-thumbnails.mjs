import { _electron as electron } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const outputRoot = path.join(repoRoot, "gallery-images", "captured", "volume");
const thumbnailAspect = 16 / 10;
const zoomByPreset = {
  sphere: -720,
  ellipsoid: -720,
  torus: -720,
  cylinder: -420,
  superquadric: -620,
  gyroid: 0,
  metaballs: -780,
  noise: -180,
  mandelbulb: -780,
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const clickVisibleButton = async (page, label) => {
  const buttons = page.getByRole("button", { name: label, exact: true });
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found: ${label}`);
};

const centeredAspectClip = (box) => {
  let width = box.width;
  let height = box.height;
  if (width / height > thumbnailAspect) width = height * thumbnailAspect;
  else height = width / thumbnailAspect;
  return {
    x: box.x + (box.width - width) * 0.5,
    y: box.y + (box.height - height) * 0.5,
    width,
    height,
  };
};

const main = async () => {
  mkdirSync(outputRoot, { recursive: true });
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ["."], cwd: repoRoot, env: environment });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1");
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await clickVisibleButton(page, "Volume");
    await page.getByTestId("volume-preset-grid").waitFor({ state: "visible" });

    const detailed = page.getByTestId("volume-detailed-controls");
    await detailed.getByRole("button", { name: "3D", exact: true }).click();
    const isoToggle = detailed.getByTestId("volume-show-isosurface");
    if (!(await isoToggle.isChecked())) await isoToggle.check();
    for (const label of ["Show crop box", "Crop gizmo", "XY plane", "XZ plane", "YZ plane"]) {
      const checkbox = detailed.getByLabel(label, { exact: true });
      if ((await checkbox.count()) > 0 && (await checkbox.isChecked())) await checkbox.uncheck();
    }

    const cards = page.locator('[data-testid^="volume-preset-card-"]');
    const ids = [];
    for (let index = 0; index < await cards.count(); index += 1) {
      const testId = await cards.nth(index).getAttribute("data-testid");
      if (testId) ids.push(testId.slice("volume-preset-card-".length));
    }

    const captures = [];
    for (const id of ids) {
      const card = page.getByTestId(`volume-preset-card-${id}`);
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await detailed.getByRole("button", { name: "Fit volume", exact: true }).click();
      const viewport = page.getByTestId("volume-spatial-pane");
      await viewport.waitFor({ state: "visible" });
      await viewport.hover();
      const zoom = zoomByPreset[id] ?? 0;
      if (zoom !== 0) await page.mouse.wheel(0, zoom);
      await wait(id === "mandelbulb" || id === "noise" ? 2400 : 1500);
      const box = await viewport.boundingBox();
      if (!box) throw new Error(`Volume viewport bounds unavailable for ${id}`);
      const clip = centeredAspectClip(box);
      await page.screenshot({
        path: path.join(outputRoot, `${id}.png`),
        clip,
      });
      captures.push({
        id,
        file: `gallery-images/captured/volume/${id}.png`,
        width: Math.round(clip.width),
        height: Math.round(clip.height),
      });
    }
    writeFileSync(
      path.join(outputRoot, "manifest.json"),
      `${JSON.stringify({
        generatedBy: "npm run capture:gallery:volume",
        mode: "Volume workspace · 3-D isosurface",
        images: captures,
      }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`[volume-thumbnails] captured ${ids.length} presets in ${outputRoot}\n`);
  } finally {
    await app.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
