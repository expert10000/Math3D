import { runScientificWorkflow, type ScientificWorkflowStep } from "@math3d/core";
import { SCIENTIFIC_OPERATION_BINDINGS } from "../scientificOperationBindings";

self.onmessage = async (event: MessageEvent<{ steps: ScientificWorkflowStep[] }>) => {
  try {
    const result = await runScientificWorkflow({ steps: event.data.steps,
      host: { environment: "browser", implementations: Object.values(SCIENTIFIC_OPERATION_BINDINGS)
        .map(binding => binding.implementationId) },
      bindings: SCIENTIFIC_OPERATION_BINDINGS });
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
