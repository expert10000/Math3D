import { describe, expect, it } from "vitest";
import { mobileExamples } from "../../apps/mobile/src/data/mobileSeedData";

describe("mobile example catalog", () => {
  it("uses one typed descriptor for every bundled example", () => {
    expect(mobileExamples).toHaveLength(12);
    expect(new Set(mobileExamples.map((example) => example.id)).size).toBe(mobileExamples.length);
    for (const example of mobileExamples) {
      expect(example.title.length).toBeGreaterThan(0);
      expect(example.scene.surfaces).toHaveLength(1);
      expect(example.scene.surfaces?.[0]?.kind).toBe(example.surfaceType);
      expect(Array.isArray(example.capabilities)).toBe(true);
      if (example.learnTopic) {
        expect(example.learnTopic.prompt.length).toBeGreaterThan(0);
        expect(example.learnTopic.insight.length).toBeGreaterThan(0);
      }
    }
  });

  it("declares worker capability requirements on implicit examples", () => {
    for (const example of mobileExamples.filter((item) => item.surfaceType === "implicit")) {
      expect(example.capabilities).toContain("vtk.preview-implicit");
    }
  });
});
