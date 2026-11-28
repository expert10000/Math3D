import { listAvailableScientificOperations, MATH3D_PLATFORM_DISCOVERY,
  scientificOperationMarkdown, generatableScientificWorkflowNodes,
  type ScientificOperationDescriptor } from "@math3d/core";

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
