/// <reference lib="webworker" />

import { instantiateNotebookStarter, type NotebookStarterId } from "../projects/notebookStarters";
import { inspectProjectCompatibility } from "../projects/projectTransfer";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<{ id: NotebookStarterId; token: string }>) => {
  try {
    const { project, resources } = instantiateNotebookStarter(event.data.id, event.data.token);
    const inspection = inspectProjectCompatibility(project, { resources });
    const entries = resources.byteEntries();
    scope.postMessage({ inspection, entries }, entries.map(entry => entry.bytes.buffer));
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
