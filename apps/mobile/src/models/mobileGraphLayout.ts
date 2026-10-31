export type MobileGraphDestination = "Graph" | "Functions" | "Analyze" | "Display" | "Promote" | "Export" | "Parameters" | "Tools" | "Cards";
/** Logical pixels, measured after safe areas/navigation. Large text requires more room, not smaller controls. */
export const mobileGraphLayout = ({ width, height, fontScale = 1, screenWidth = width, screenHeight = height }: {
  width: number; height: number; fontScale?: number; screenWidth?: number; screenHeight?: number;
}) => {
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const split = Number.isFinite(width) && Number.isFinite(height) && width / scale >= 840 && height / scale >= 480;
  const compactLandscape = !split && Number.isFinite(width) && Number.isFinite(height) &&
    Number.isFinite(screenWidth) && Number.isFinite(screenHeight) && screenWidth > screenHeight &&
    width > height && height / scale < 480;
  const panelWidth = split ? Math.min(440 * scale, Math.max(340 * scale, width * 0.36)) : 0;
  return { split, compactLandscape, panelWidth, graphMinWidth: split ? 400 * scale : 0,
    panelPlacement: split ? "side" as const : "sheet" as const };
};
export const mobileGraphPanelDestination = (destination: MobileGraphDestination, split: boolean): Exclude<MobileGraphDestination, "Graph"> | null =>
  destination === "Graph" ? split ? "Functions" : null : destination;
