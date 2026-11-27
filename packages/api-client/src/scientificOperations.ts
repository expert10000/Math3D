import { listAvailableScientificOperations, MATH3D_PLATFORM_DISCOVERY,
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
