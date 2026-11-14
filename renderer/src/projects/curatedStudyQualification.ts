import { resolvePlatformJourneys, serializeMath3DProject, type Math3DProject, type PlatformCapabilitySnapshot } from "@math3d/core";
import type { CuratedStudy } from "./curatedStudyCatalog";
import { projectResourceInventory, type VerifiedProjectResources } from "./projectResources";

export type CuratedStudyQualification = Readonly<{
  mode: "open" | "preview" | "unavailable";
  reason: string | null;
  offline: string;
  measuredBytes: number | null;
  source: "prepared-copy" | "saved-copy" | "unmeasured";
}>;

/** Counts the actual Project JSON and verified resource bytes before quoting an asset size. */
export function measureCuratedStudyAssets(project: Math3DProject, resources?: VerifiedProjectResources) {
  const projectBytes = new TextEncoder().encode(serializeMath3DProject(project)).byteLength;
  let resourceBytes = 0;
  for (const item of projectResourceInventory(project)) resourceBytes += resources?.bytes(item)?.byteLength ?? 0;
  return { projectBytes, resourceBytes, totalBytes: projectBytes + resourceBytes };
}

export function qualifyCuratedStudy(item: CuratedStudy, host: PlatformCapabilitySnapshot,
  options: { quantumChooser?: boolean; casAvailable?: boolean; measuredBytes?: number | null;
    source?: CuratedStudyQualification["source"]; savedCopyLimit?: string | null } = {}): CuratedStudyQualification {
  const measuredBytes = options.measuredBytes ?? null, source = options.source ?? "unmeasured";
  const base = { measuredBytes, source };
  const storage = host.facilities.persistentStorage;
  const gallery = resolvePlatformJourneys(host).gallery;
  if (item.route.kind === "verified-quantum-import") return {
    ...base, mode: host.runtime === "desktop" && options.quantumChooser && storage.available ? "open" : "unavailable",
    reason: host.runtime !== "desktop" ? "Verified scene import requires the desktop app." :
      !options.quantumChooser ? "Verified scene chooser is unavailable on this desktop host." :
        !storage.available ? storage.reason : null,
    offline: "A previously produced local scene opens offline after its bundle is verified.",
  };
  if (item.route.kind === "cas-gallery") return {
    ...base, mode: options.casAvailable ? "open" : "unavailable",
    reason: options.casAvailable ? null : "CAS examples are unavailable in this host view.",
    offline: "Bundled definitions open offline; saving needs a named Project and persistent storage.",
  };
  const desktopOnly = item.platforms.length === 1 && item.platforms[0] === "desktop";
  const unsupportedHost = host.runtime === "mobile" || desktopOnly && host.runtime !== "desktop";
  const reason = unsupportedHost ? desktopOnly ? "This Study opens fully on desktop; inspect its saved Project preview here." :
    "This mobile host can inspect a saved Project preview; full Study editing is unavailable." : gallery.reason ?? options.savedCopyLimit ?? null;
  return { ...base, mode: reason ? "preview" : "open", reason,
    offline: "Bundled Project and retained local resources open without a network connection." };
}
