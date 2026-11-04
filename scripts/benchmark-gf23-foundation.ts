import { performance } from "node:perf_hooks";
import { sampleVectorField3DProbe, sampleVectorField3DSlice,
  verifiedVectorFieldSampler } from "../packages/core/src/index";
import { createGf23Project, gf23Transfer } from
  "../tests/fixtures/graph-field/gf23Bundle";

const source = createGf23Project().workspace.entries[0]!.checkpoint;
if (source.format !== "math3d.vector-field3d-document") throw new Error("Wrong benchmark fixture.");
const transfer = gf23Transfer();
const point = [0.4, 0, 0] as const;
const samples = 20;
const measure = (run: () => void) => {
  const times: number[] = [];
  let peakRss = process.memoryUsage().rss;
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)],
    maxMs: times.at(-1), peakRssBytes: peakRss };
};
const baselinePreview = measure(() => { sampleVectorField3DSlice(source, 2, 0, transfer); });
const profilePreview = measure(() => {
  const sampler = verifiedVectorFieldSampler(source, transfer);
  for (let i = 0; i < 21; i++) {
    const vector = sampler.sample([-4 + i * 0.4, 0, 0]);
    if (!vector) throw new Error("Profile coverage gap in fixture.");
    Math.hypot(...vector);
  }
});
const baselineInteraction = measure(() => { sampleVectorField3DProbe(source, point, transfer); });
const sampler = verifiedVectorFieldSampler(source, transfer);
const profileInteraction = measure(() => { sampler.sample(point); });
process.stdout.write(JSON.stringify({ fixture: "vortex-volume 21x21x17", samples,
  baselinePreview, profilePreview, baselineInteraction, profileInteraction,
  transferBytes: transfer.volumes.reduce((sum, volume) => sum + volume.values.length * 8, 0),
  brokerMemoryCapBytes: 2 * 1024 * 1024 }, null, 2) + "\n");
