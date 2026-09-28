import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import { getGraph2DPresetCatalog, renderGraph2DPresetPreview, graph2DPresetPreviewKey, sampleGraph2DScene,
  createGraph2DPreset } from "@math3d/core";
import manifest from "../../../packages/core/fixtures/graph2d/gallery-previews.json";
describe("reproducible static gallery previews", () => {
  it("matches every digest/asset and fits the shared budgets without executing content", () => {
    expect(manifest.entries).toHaveLength(20); expect(manifest.compressedBytes).toBeLessThan(2*1024*1024);
    for (const preset of getGraph2DPresetCatalog().entries) {
      const preview = renderGraph2DPresetPreview(preset), entry = manifest.entries.find(e => e.id===preset.id)!;
      expect(preview.key).toBe(entry.key); expect(entry.presetDigest).toBe(preset.digest);
      expect(preview.samples).toBeLessThanOrEqual(1024);
      expect(preview.svg).not.toMatch(/NaN|Infinity|<script|onload=|foreignObject/);
      for (const [filename,hash] of [[entry.svg,entry.svgHash],[entry.png,entry.pngHash]]) {
        const bytes=readFileSync(new URL(`../../../packages/core/assets/graph2d-gallery/${filename}`,import.meta.url));
        expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(hash);
      }
      const doc={...preset.template,display:{...preset.template.display,sampling:{maxSamples:1024,maxDepth:12,tolerancePx:.75}}};
      const series=sampleGraph2DScene({document:doc,viewport:doc.display.viewport,width:320,height:180,interaction:false,
        pointTables:Object.fromEntries(preset.sidecars.map(s=>[s.id,s.rows]))});
      for(const [i,s] of series.entries()) {
        const object=doc.source.objects[i]!;
        if(object.kind==='explicit-cartesian') {
          const xs=s.artifact.segments.flatMap(seg=>seg.points.map(p=>p.x));
          expect(Math.min(...xs)).toBeLessThanOrEqual(Math.max(object.domain.min,doc.display.viewport.xMin)+1e-6);
          expect(Math.max(...xs),`${preset.id}: tail coverage`).toBeGreaterThanOrEqual(Math.min(object.domain.max,doc.display.viewport.xMax)-1e-6);
        }
      }
    }
  });
  it("invalidates changed source/display metadata and safely escapes titles", () => {
    const original=getGraph2DPresetCatalog().entries[0]!;
    const changed=createGraph2DPreset({...original,title:'<script> & "title"'});
    expect(graph2DPresetPreviewKey(changed)).not.toBe(graph2DPresetPreviewKey(original));
    expect(renderGraph2DPresetPreview(changed).svg).toContain('&lt;script&gt; &amp; &quot;title&quot;');
  });
});
