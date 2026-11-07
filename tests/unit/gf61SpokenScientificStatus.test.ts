import { describe, expect, it } from "vitest";
import { scientificSpeechSummary, speakScientificUnit } from
  "../../apps/mobile/src/models/mobileScientificSpeech";

describe("GF-61 concise scientific focus announcements", () => {
  it("says the tensor unit, source revision and withholding reason before provenance detail", () => {
    const current = scientificSpeechSummary({ title: "Tensor principal-direction glyphs",
      kind: "Saved tensor display recipe", status: "recipe retained",
      detail: "Unit m/s/m; 16 bounded glyph positions; source revision 2, hash sha256:abcdef. Values are not recomputed on mobile." });
    expect(current).toContain("Unit metres per second per metre");
    expect(current).toContain("Source revision 2");
    expect(current).toContain("Values require verification before display");
    expect(current).not.toContain("sha256:");
    const withheld = scientificSpeechSummary({ title: "Tensor principal-direction glyphs",
      kind: "Saved tensor display recipe", status: "withheld",
      detail: "Unit m/s/m; source revision 2, hash sha256:abcdef. Values withheld: source-missing-or-changed." });
    expect(withheld).toContain("Values withheld because source missing or changed");
  });
  it("speaks Graph axes and unverified selections without inventing source pins", () => {
    const graph = scientificSpeechSummary({ title: "Return map",
      kind: "Poincaré Graph row", status: "withheld",
      detail: "Return-map axis unit m, value unit m; Values withheld: source-changed." });
    expect(graph).toContain("Axis unit metres. Value unit metres.");
    expect(graph).toContain("Values withheld because source changed");
    const selection = scientificSpeechSummary({ title: "point selection",
      kind: "Scientific selection", status: "unverified",
      detail: "probe geometry; coordinate units m, m, m. No source was saved." });
    expect(selection).toContain("Coordinate units metres, metres, metres");
    expect(selection).toContain("Source unverified");
    expect(speakScientificUnit("1/s")).toBe("per second");
  });
});
