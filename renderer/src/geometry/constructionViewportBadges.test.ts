import { describe, expect, it } from "vitest";
import { buildConstructionViewportBadgeById, getConstructionViewportBadgePrefix } from "./constructionViewportBadges";

describe("construction viewport badges", () => {
  it("uses compact prefixes for common construction object families", () => {
    expect(getConstructionViewportBadgePrefix("midpoint")).toBe("M");
    expect(getConstructionViewportBadgePrefix("line-through-objects")).toBe("L");
    expect(getConstructionViewportBadgePrefix("face-offset-plane")).toBe("P");
    expect(getConstructionViewportBadgePrefix("normal-to-object-at-object")).toBe("N");
    expect(getConstructionViewportBadgePrefix("circle-center-through-object")).toBe("C");
  });

  it("numbers badges per prefix in creation order", () => {
    const badgeById = buildConstructionViewportBadgeById([
      { id: "late-line", type: "parallel-line-through-object", createdAt: 30 },
      { id: "midpoint", type: "midpoint", createdAt: 10 },
      { id: "first-line", type: "line-through-objects", createdAt: 20 },
      { id: "plane", type: "face-offset-plane", createdAt: 40 },
      { id: "normal", type: "normal-to-object-at-object", createdAt: 50 },
    ]);

    expect(badgeById.get("midpoint")).toBe("M1");
    expect(badgeById.get("first-line")).toBe("L1");
    expect(badgeById.get("late-line")).toBe("L2");
    expect(badgeById.get("plane")).toBe("P1");
    expect(badgeById.get("normal")).toBe("N1");
  });
});
