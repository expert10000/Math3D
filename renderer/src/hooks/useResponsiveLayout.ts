import { useEffect, useMemo, useState } from "react";

export const RESPONSIVE_LAYOUT_BREAKPOINTS = {
  mobile: 768,
  narrow: 980,
  desktop: 1100,
  phoneLandscapeMaxWidth: 980,
  phoneLandscapeMaxHeight: 560,
  viewerMinHeightRatio: 0.6,
} as const;

export type ResponsiveLayoutBand = "mobile" | "tablet" | "desktop";
export type ResponsiveOrientation = "portrait" | "landscape";

export type ResponsiveViewportSize = {
  width: number;
  height: number;
};

export type ResponsiveLayout = ResponsiveViewportSize & {
  viewport: ResponsiveViewportSize;
  band: ResponsiveLayoutBand;
  orientation: ResponsiveOrientation;
  mobile: boolean;
  tablet: boolean;
  desktop: boolean;
  narrow: boolean;
  compact: boolean;
  phoneLandscape: boolean;
  viewerMinHeight: number;
};

const FALLBACK_VIEWPORT: ResponsiveViewportSize = {
  width: 1366,
  height: 768,
};

const normalizeDimension = (value: number | undefined, fallback: number): number => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
};

export const createResponsiveLayout = (viewport: Partial<ResponsiveViewportSize> = {}): ResponsiveLayout => {
  const width = normalizeDimension(viewport.width, FALLBACK_VIEWPORT.width);
  const height = normalizeDimension(viewport.height, FALLBACK_VIEWPORT.height);
  const mobile = width < RESPONSIVE_LAYOUT_BREAKPOINTS.mobile;
  const desktop = width >= RESPONSIVE_LAYOUT_BREAKPOINTS.desktop;
  const tablet = !mobile && !desktop;
  const orientation: ResponsiveOrientation = width >= height ? "landscape" : "portrait";

  return {
    width,
    height,
    viewport: { width, height },
    band: mobile ? "mobile" : tablet ? "tablet" : "desktop",
    orientation,
    mobile,
    tablet,
    desktop,
    narrow: width <= RESPONSIVE_LAYOUT_BREAKPOINTS.narrow,
    compact: !desktop,
    phoneLandscape:
      orientation === "landscape" &&
      width <= RESPONSIVE_LAYOUT_BREAKPOINTS.phoneLandscapeMaxWidth &&
      height <= RESPONSIVE_LAYOUT_BREAKPOINTS.phoneLandscapeMaxHeight,
    viewerMinHeight: Math.floor(height * RESPONSIVE_LAYOUT_BREAKPOINTS.viewerMinHeightRatio),
  };
};

const readWindowViewport = (): ResponsiveViewportSize => {
  if (typeof window === "undefined") return FALLBACK_VIEWPORT;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
};

export const useResponsiveLayout = (): ResponsiveLayout => {
  const [viewport, setViewport] = useState<ResponsiveViewportSize>(() => readWindowViewport());

  useEffect(() => {
    if (typeof window === "undefined") return;

    let animationFrameId: number | null = null;
    const updateViewport = () => {
      const applyViewport = () => {
        animationFrameId = null;
        setViewport(readWindowViewport());
      };

      if (typeof window.requestAnimationFrame === "function") {
        if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
        animationFrameId = window.requestAnimationFrame(applyViewport);
        return;
      }

      applyViewport();
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      if (animationFrameId !== null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  return useMemo(() => createResponsiveLayout(viewport), [viewport]);
};
