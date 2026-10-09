import type { Math3DProject, ProjectResourceCapture } from "@math3d/core";
import { VerifiedProjectResources } from "./projectResources";
import { instantiateNotebookStarter, type NotebookStarterId } from "./notebookStarters";
import { inspectProjectCompatibility, type ProjectCompatibility } from "./projectTransfer";

type PreparedStarter = { project: Math3DProject; resources: VerifiedProjectResources; inspection: ProjectCompatibility };
type WorkerResult = { inspection: ProjectCompatibility; entries: ProjectResourceCapture[] } | { error: string };
const prepared = new Map<NotebookStarterId, Promise<PreparedStarter>>();

export const prewarmNotebookStarter = (id: NotebookStarterId): Promise<PreparedStarter> => {
  const existing = prepared.get(id);
  if (existing) return existing;
  const token = crypto.randomUUID();
  const task = new Promise<PreparedStarter>((resolve, reject) => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      try {
        const { project, resources } = instantiateNotebookStarter(id, token);
        resolve({ project, resources, inspection: inspectProjectCompatibility(project, { resources }) });
      } catch (error) { reject(error); }
    };
    if (typeof Worker === "undefined") { fallback(); return; }
    let worker: Worker;
    try { worker = new Worker(new URL("../workers/notebookStarterWorker.ts", import.meta.url), { type: "module" }); }
    catch { fallback(); return; }
    worker.onmessage = async (event: MessageEvent<WorkerResult>) => {
      worker.terminate();
      if (settled) return;
      if ("error" in event.data) { fallback(); return; }
      settled = true;
      try {
        const resources = await VerifiedProjectResources.fromCapturedBytes(event.data.inspection.project, event.data.entries);
        resolve({ project: event.data.inspection.project, resources, inspection: event.data.inspection });
      } catch (error) { reject(error); }
    };
    worker.onerror = () => { worker.terminate(); fallback(); };
    try { worker.postMessage({ id, token }); } catch { worker.terminate(); fallback(); }
  });
  prepared.set(id, task);
  void task.catch(() => { if (prepared.get(id) === task) prepared.delete(id); });
  return task;
};

export const takePreparedNotebookStarter = async (id: NotebookStarterId): Promise<PreparedStarter> => {
  const task = prewarmNotebookStarter(id);
  const result = await task;
  if (prepared.get(id) === task) prepared.delete(id);
  return result;
};
