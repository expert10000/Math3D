import { resolvePlatformJourneys, type PlatformCapabilitySnapshot, type PlatformJourneyEvidence } from "@math3d/core";
import type { ProjectCompatibility } from "./projectTransfer";

const needsWebgl2 = new Set(["geometry", "mesh", "surface", "volume", "field", "vector3d", "quantum"]);

/** Translate verified Project compatibility into host decisions without guessing backend health. */
export const resolveProjectJourneys = (host: PlatformCapabilitySnapshot, compatibility?: ProjectCompatibility | null,
  compute?: PlatformJourneyEvidence["compute"]) => resolvePlatformJourneys(host, {
  ...(compatibility ? { project: {
    verified: true,
    canRestore: compatibility.canOpenWorkspace,
    reason: compatibility.reasons.join(" ") || null,
    requiresWebgl2: compatibility.documents.some(document => needsWebgl2.has(document.module)),
    hasResearch: !!(compatibility.project.workspace.studies?.length || compatibility.project.workbooks?.length || compatibility.project.notes?.length),
  } } : {}),
  ...(compute ? { compute } : {}),
});
