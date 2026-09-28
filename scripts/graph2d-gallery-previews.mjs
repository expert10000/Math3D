import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
const requireRenderer = createRequire(resolve("renderer/package.json"));
const { build } = requireRenderer("esbuild");
mkdirSync("output",{recursive:true});
await build({ entryPoints:["packages/core/src/index.ts"], bundle:true, platform:"node", format:"esm", outfile:"output/graph2d-gallery-core.mjs" });
const core = await import(pathToFileURL(resolve("output/graph2d-gallery-core.mjs")).href+`?build=${Date.now()}`);
const assetDir=resolve("packages/core/assets/graph2d-gallery"); mkdirSync(assetDir,{recursive:true});
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:320,height:180},deviceScaleFactor:1});
let compressedBytes=0; const entries=[];
try {
  for (const preset of core.getGraph2DPresetCatalog().entries) {
    const preview=core.renderGraph2DPresetPreview(preset), svg=Buffer.from(preview.svg);
    await page.setContent(`<style>html,body{margin:0;width:320px;height:180px;overflow:hidden}</style>${preview.svg}`);
    const png=await page.screenshot({type:"png"});
    compressedBytes+=gzipSync(svg).length+png.length;
    const entry={id:preset.id,presetDigest:preset.digest,key:preview.key,svg:`${preset.id}.svg`,png:`${preset.id}.png`,
      svgHash:digest(svg),pngHash:digest(png),samples:preview.samples,diagnostics:preview.diagnostics};
    if(process.argv.includes("--check")) {
      if(digest(readFileSync(resolve(assetDir,entry.svg)))!==entry.svgHash || digest(readFileSync(resolve(assetDir,entry.png)))!==entry.pngHash)
        throw new Error(`Stale preview asset: ${preset.id}`);
    } else { writeFileSync(resolve(assetDir,entry.svg),svg);writeFileSync(resolve(assetDir,entry.png),png); }
    entries.push(entry);
  }
} finally { await browser.close(); }
if(compressedBytes>2*1024*1024)throw new Error("Gallery previews exceed 2 MiB compressed budget.");
const manifest={format:"math3d.graph2d-gallery-previews",version:1,recipe:core.GRAPH2D_PREVIEW_RECIPE,compressedBytes,entries};
const target="packages/core/fixtures/graph2d/gallery-previews.json";
if(process.argv.includes("--check")) { if(JSON.stringify(JSON.parse(readFileSync(target,"utf8")))!==JSON.stringify(manifest))throw new Error("Stale preview manifest."); }
else writeFileSync(target,JSON.stringify(manifest,null,2)+"\n");
console.log(`Verified ${entries.length} SVG/PNG previews (${compressedBytes} compressed bytes).`);
