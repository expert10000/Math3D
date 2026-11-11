import { projectResourceInventory, resolvePlatformJourneys, VerifiedProjectResources,
  type PlatformCapabilitySnapshot } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { readMobilePreviewProject } from "./mobileProjectPreview";
import { mobileProjectResourceContext } from "./mobileProjectResources";

/** Mobile preview remains inspectable; source bytes and editor limits stay explicit. */
export const resolveMobileProjectJourneys = (stored: MobileStoredSceneProject, host: PlatformCapabilitySnapshot) => {
  const project = readMobilePreviewProject(stored);
  const resources = new VerifiedProjectResources(project, stored.projectResources ?? [], mobileProjectResourceContext);
  const missing = projectResourceInventory(project).filter(item => item.required && !resources.bytes(item));
  const reason = missing.length ? `Required Project source resources are missing: ${missing.map(item => item.id).join(", ")}.` :
    "Mobile keeps this Project as a saved preview; only supported Graph, Curve and Surface sources can enter editors.";
  return resolvePlatformJourneys(host, { project: { verified: true, canRestore: false, reason,
    requiresWebgl2: false, hasResearch: !!(project.workspace.studies?.length || project.workbooks?.length || project.notes?.length) } });
};
