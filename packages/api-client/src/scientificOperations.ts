import { listAvailableScientificOperations, MATH3D_PLATFORM_DISCOVERY,
  scientificOperationMarkdown, generatableScientificWorkflowNodes,
  validateDiscoveryJsonValue, type ScientificOperationDescriptor,
  type ScientificWorkflowStep } from "@math3d/core";

/** Registry descriptors for API documentation; registration alone never implies server execution. */
export const listApiScientificOperationDescriptors = (): readonly ScientificOperationDescriptor[] =>
  MATH3D_PLATFORM_DISCOVERY.list("scientific-operations")
    .filter((entry): entry is ScientificOperationDescriptor => entry.kind === "scientific-operations");

/** A server advertises only the implementation IDs it has actually bound. */
export const discoverApiScientificOperations = (
  verifiedImplementationIds: readonly string[] = [],
): readonly ScientificOperationDescriptor[] =>
  listAvailableScientificOperations({ environment: "server", implementations: verifiedImplementationIds });

/** Documentation is generated from the same contracts used for discovery. */
export const apiScientificOperationDocumentation = (id: string): string | null => {
  const descriptor = listApiScientificOperationDescriptors().find(item => item.id === id);
  return descriptor ? scientificOperationMarkdown(descriptor) : null;
};

/** A workflow editor can request only nodes backed by this server's verified implementations. */
export const apiScientificWorkflowNodes = (verifiedImplementationIds: readonly string[] = []) =>
  generatableScientificWorkflowNodes({ environment: "server", implementations: verifiedImplementationIds });

/** Connect to a running Math3D scientific API and verify its bound contracts. */
export async function connectApiScientificOperations(baseUrl: string,
  fetcher: typeof fetch = fetch) {
  const origin = new URL(baseUrl);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password)
    throw new TypeError("Expected an HTTP(S) scientific API origin.");
  const endpoint = origin.href.replace(/\/$/, "");
  const discoveryResponse = await fetcher(`${endpoint}/v1/operations`);
  if (!discoveryResponse.ok) throw new Error(`Scientific API discovery failed: ${discoveryResponse.status}`);
  const discovery = await discoveryResponse.json() as { operations?: ScientificOperationDescriptor[];
    verifiedImplementationIds?: string[] };
  if (!Array.isArray(discovery.operations) || !Array.isArray(discovery.verifiedImplementationIds))
    throw new TypeError("Scientific API did not report verified bindings.");
  const verified = discoverApiScientificOperations(discovery.verifiedImplementationIds)
    .filter(local => discovery.operations!.some(remote => remote.id === local.id &&
      remote.version === local.version && remote.implementationId === local.implementationId));
  const byId = new Map(verified.map(descriptor => [descriptor.id, descriptor]));
  return Object.freeze({
    operations: verified,
    execute: async (id: string, input: unknown, parameters: unknown = {}): Promise<unknown> => {
      const descriptor = byId.get(id);
      if (!descriptor) throw new TypeError(`No verified server operation: ${id}`);
      if (!validateDiscoveryJsonValue(descriptor.inputSchema, input) ||
          !validateDiscoveryJsonValue(descriptor.parameterSchema, parameters))
        throw new TypeError(`Invalid input or parameters for ${id}`);
      const response = await fetcher(`${endpoint}/v1/operations/${encodeURIComponent(id)}/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, parameters }),
      });
      if (!response.ok) throw new Error(`Scientific API execution failed: ${response.status}`);
      const envelope = await response.json() as { operationId?: string; output?: unknown };
      if (envelope.operationId !== id || !validateDiscoveryJsonValue(descriptor.outputSchema, envelope.output))
        throw new TypeError(`Scientific API returned an invalid result for ${id}`);
      return envelope.output;
    },
    runWorkflow: async (steps: readonly ScientificWorkflowStep[]): Promise<unknown> => {
      if (steps.some(step => !byId.has(step.operationId)))
        throw new TypeError("Workflow contains an unverified server operation.");
      const response = await fetcher(`${endpoint}/v1/workflows/execute`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps }) });
      if (!response.ok) throw new Error(`Scientific API workflow failed: ${response.status}`);
      const result = await response.json() as { steps?: {
        id?: string; operationId?: string; output?: unknown }[] };
      if (!Array.isArray(result.steps) || result.steps.length !== steps.length ||
          result.steps.some((completed, index) => completed.id !== steps[index].id ||
            completed.operationId !== steps[index].operationId ||
            !validateDiscoveryJsonValue(byId.get(steps[index].operationId)!.outputSchema,
              completed.output)))
        throw new TypeError("Scientific API returned an invalid workflow result.");
      return result;
    },
  });
}
