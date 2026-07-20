import { describe, expect, it } from "vitest";

import { createResponsiveLayout, RESPONSIVE_LAYOUT_BREAKPOINTS } from "./useResponsiveLayout";

describe("createResponsiveLayout", () => {
  it("classifies phone-sized viewports as mobile", () => {
    const layout = createResponsiveLayout({ width: 390, height: 844 });

    expect(layout.band).toBe("mobile");
    expect(layout.mobile).toBe(true);
    expect(layout.tablet).toBe(false);
    expect(layout.desktop).toBe(false);
    expect(layout.narrow).toBe(true);
    expect(layout.compact).toBe(true);
    expect(layout.orientation).toBe("portrait");
  });

  it("classifies intermediate widths as tablet", () => {
    const layout = createResponsiveLayout({ width: RESPONSIVE_LAYOUT_BREAKPOINTS.mobile, height: 900 });

    expect(layout.band).toBe("tablet");
    expect(layout.mobile).toBe(false);
    expect(layout.tablet).toBe(true);
    expect(layout.desktop).toBe(false);
    expect(layout.narrow).toBe(true);
    expect(layout.compact).toBe(true);
  });

  it("classifies desktop widths at the desktop breakpoint", () => {
    const layout = createResponsiveLayout({ width: RESPONSIVE_LAYOUT_BREAKPOINTS.desktop, height: 900 });

    expect(layout.band).toBe("desktop");
    expect(layout.mobile).toBe(false);
    expect(layout.tablet).toBe(false);
    expect(layout.desktop).toBe(true);
    expect(layout.narrow).toBe(false);
    expect(layout.compact).toBe(false);
  });

  it("keeps narrow and tablet signals separate for existing stacked workspaces", () => {
    const layout = createResponsiveLayout({ width: 1040, height: 900 });

    expect(layout.band).toBe("tablet");
    expect(layout.narrow).toBe(false);
    expect(layout.compact).toBe(true);
  });

  it("exposes phone landscape and viewer priority signals", () => {
    const layout = createResponsiveLayout({ width: 932, height: 430 });

    expect(layout.phoneLandscape).toBe(true);
    expect(layout.viewerMinHeight).toBe(258);
  });
});
