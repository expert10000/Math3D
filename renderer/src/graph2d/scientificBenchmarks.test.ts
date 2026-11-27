import { describe, expect, it } from "vitest";
import { benchmarkPreset, runScientificBenchmark, scientificBenchmarks } from "./scientificBenchmarks";

describe("scientific benchmark helper", () => {
  it("runs the six Graphs cases against actual sampled or integrated results", () => {
    for (const item of scientificBenchmarks.filter(value => value.automated)) {
      expect(benchmarkPreset(item.id)?.template.source.objects).toHaveLength(1);
      expect(runScientificBenchmark(item.id), item.title).toMatchObject({ status: "pass" });
    }
  });

  it("does not claim a pass for cross-module guided cases", () => {
    for (const item of scientificBenchmarks.filter(value => !value.automated)) {
      expect(benchmarkPreset(item.id)).toBeNull();
      expect(runScientificBenchmark(item.id).status).toBe("fail");
    }
  });
});
