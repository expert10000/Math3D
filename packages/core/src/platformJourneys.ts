import type { PlatformCapabilitySnapshot } from "./platformCapabilities";

export type PlatformJourneyStatus = Readonly<{ mode: "open" | "preview" | "unavailable"; reason: string | null }>;
export type PlatformJourneyEvidence = Readonly<{
  project?: Readonly<{
    verified: boolean;
    canRestore: boolean;
    reason: string | null;
    requiresWebgl2: boolean;
    hasResearch: boolean;
  }>;
  compute?: Readonly<{ route: "local-worker" | "remote"; verified: boolean; reason: string | null }>;
}>;
export type PlatformJourneys = Readonly<{
  project: PlatformJourneyStatus;
  projectSave: PlatformJourneyStatus;
  gallery: PlatformJourneyStatus;
  research: PlatformJourneyStatus;
  compute: PlatformJourneyStatus;
}>;

const open: PlatformJourneyStatus = { mode: "open", reason: null };
const preview = (reason: string): PlatformJourneyStatus => ({ mode: "preview", reason });
const unavailable = (reason: string): PlatformJourneyStatus => ({ mode: "unavailable", reason });

/** A host probe only establishes facilities. Project and compute evidence must be supplied separately. */
export const resolvePlatformJourneys = (host: PlatformCapabilitySnapshot, evidence: PlatformJourneyEvidence = {}): PlatformJourneys => {
  const storage = host.facilities.persistentStorage;
  const rendering = host.facilities.webgl2;
  const project = evidence.project;
  const projectStatus = !project ? unavailable("No verified Project has been selected.") :
    !project.verified ? unavailable("Project validation has not completed.") :
      host.runtime === "mobile" ? preview("This mobile host offers a saved Project preview; document editors vary by source.") :
        !project.canRestore ? preview(project.reason ?? "This Project has a missing source or unsupported editor.") :
          project.requiresWebgl2 && !rendering.available ? preview(rendering.reason ?? "WebGL2 is unavailable.") : open;
  const projectSave = !project || !project.verified ? unavailable("A verified Project is required before saving.") :
    !storage.available ? unavailable(storage.reason ?? "Persistent storage is unavailable.") : open;
  const gallery = host.runtime === "mobile" ? preview("Mobile opens supported saved Project previews; guided desktop Studies are unavailable.") :
    !host.facilities.dom.available ? unavailable(host.facilities.dom.reason ?? "The Gallery requires a DOM.") :
      !storage.available ? preview(storage.reason ?? "Persistent storage is unavailable.") :
        !rendering.available ? preview(rendering.reason ?? "WebGL2 is unavailable.") : open;
  const research = !project?.hasResearch ? unavailable("No saved Study, Workbook or Note is available in this Project.") :
    projectStatus.mode !== "open" ? preview(projectStatus.reason ?? "Open the Project to follow its saved research path.") :
      !storage.available ? preview(storage.reason ?? "Persistent storage is unavailable.") : open;
  const route = evidence.compute;
  const compute = !route || !route.verified ? unavailable(route?.reason ?? "No compute route has been verified for this host.") :
    route.route === "remote" && !host.facilities.network.available ? unavailable(host.facilities.network.reason ?? "Network transport is unavailable.") :
      route.route === "local-worker" && !host.facilities.backgroundWorker.available ? unavailable(host.facilities.backgroundWorker.reason ?? "Background worker is unavailable.") : open;
  return { project: projectStatus, projectSave, gallery, research, compute };
};
