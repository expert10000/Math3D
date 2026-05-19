import { _electron as electron } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outPath = path.join(
  repoRoot,
  "apps",
  "public-site",
  "src",
  "assets",
  "showcase",
  "pipeline",
  "math3d-pipeline-analysis-height-playwright.png"
);
const requestedCard = (process.env.MATH3D_CAPTURE_SURFACE_CARD ?? "").trim();
const requestedPresetButton = (process.env.MATH3D_CAPTURE_PRESET_BUTTON ?? "").trim();
const requestedExpression = (process.env.MATH3D_CAPTURE_EXPRESSION ?? "").trim();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickFirstVisibleByName(page, name) {
  const nodes = page.getByRole("button", { name });
  const count = await nodes.count();
  for (let i = 0; i < count; i += 1) {
    const node = nodes.nth(i);
    if (!(await node.isVisible())) continue;
    await node.click();
    return true;
  }
  return false;
}

async function clickFirstVisibleByNamePattern(page, name) {
  const nodes = page.getByRole("button", { name });
  const count = await nodes.count();
  for (let i = 0; i < count; i += 1) {
    const node = nodes.nth(i);
    if (!(await node.isVisible())) continue;
    await node.click();
    return true;
  }
  return false;
}

async function clickFirstVisibleText(page, textPattern) {
  const nodes = page.getByText(textPattern, { exact: true });
  const count = await nodes.count();
  for (let i = 0; i < count; i += 1) {
    const node = nodes.nth(i);
    if (!(await node.isVisible())) continue;
    await node.click();
    return true;
  }
  return false;
}

async function main() {
  mkdirSync(path.dirname(outPath), { recursive: true });
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
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await clickFirstVisibleByName(page, "Surfaces");
    await wait(200);
    await clickFirstVisibleByName(page, "Inspector");
    await wait(150);
    await clickFirstVisibleByNamePattern(page, /^Surface editor$/i);
    await wait(220);

    if (requestedExpression) {
      const exprInput = page.locator("textarea").first();
      if (await exprInput.isVisible()) {
        await exprInput.fill(requestedExpression);
        await wait(120);
        await clickFirstVisibleByNamePattern(page, /^Apply$/i);
        await wait(420);
        await clickFirstVisibleByNamePattern(page, /^Bake to Mesh$/i);
        await wait(900);
      }
    }
    if (requestedPresetButton) {
      const presetPattern = new RegExp(`^${requestedPresetButton}$`, "i");
      const presetClicked =
        (await clickFirstVisibleByNamePattern(page, presetPattern)) || (await clickFirstVisibleText(page, presetPattern));
      if (!presetClicked) {
        await clickFirstVisibleByNamePattern(page, /^More$/i);
        await wait(120);
        await clickFirstVisibleText(page, presetPattern);
      }
      await wait(280);
      await clickFirstVisibleByNamePattern(page, /^Bake to Mesh$/i);
      await wait(900);
    }
    const openGallery = requestedPresetButton ? false : await clickFirstVisibleByNamePattern(page, /^Gallery$/i);
    if (openGallery) {
      await wait(350);
      const preferredCards = requestedCard
        ? [requestedCard]
        : ["surface-gallery-card-enneper", "surface-gallery-card-helicoid", "surface-gallery-card-mexican_hat"];
      for (const testId of preferredCards) {
        const card = page.getByTestId(testId).first();
        if (!(await card.count())) continue;
        if (!(await card.isVisible())) continue;
        await card.click();
        await wait(280);
        await clickFirstVisibleByNamePattern(page, /^Bake to Mesh$/i);
        await wait(900);
        break;
      }
    }

    await clickFirstVisibleByNamePattern(page, /^Analyze$/i);
    await wait(250);
    await clickFirstVisibleByNamePattern(page, /^View$/i);
    await wait(200);
    const heightPattern = /^Height$/i;
    const rainbowPattern = /^rainbow$/i;
    await clickFirstVisibleByNamePattern(page, heightPattern);
    await clickFirstVisibleText(page, heightPattern);
    await wait(200);
    await clickFirstVisibleByNamePattern(page, rainbowPattern);
    await clickFirstVisibleText(page, rainbowPattern);
    await wait(550);
    await clickFirstVisibleByNamePattern(page, /^Collapse$/i);
    await wait(180);

    const canvasHost = page.getByTestId("surface-viewer-canvas-host").first();
    if (await canvasHost.isVisible()) {
      await canvasHost.screenshot({ path: outPath });
    } else {
      await page.screenshot({ path: outPath, fullPage: true });
    }

    console.log(`[capture] wrote ${outPath}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
