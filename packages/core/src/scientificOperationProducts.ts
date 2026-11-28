import { MATH3D_PLATFORM_DISCOVERY, resolveScientificOperationAvailability,
  validateDiscoveryJsonValue, type DiscoveryJsonSchema, type ScientificOperationDescriptor,
  type ScientificOperationHost } from "./platformDiscovery";
import type { ScientificResult } from "./scientificCapabilityRegistry";

export type ScientificParameterField = Readonly<{
  name: string;
  schema: DiscoveryJsonSchema;
  required: boolean;
  editable: boolean;
}>;

export type ScientificWorkflowNode = Readonly<{
  id: string;
  title: string;
  module: string;
  operationId: string;
  inputSchema: DiscoveryJsonSchema;
  parameterSchema: DiscoveryJsonSchema;
  outputSchema: DiscoveryJsonSchema;
  visualizationIds: readonly string[];
  validatorIds: readonly string[];
}>;

/** Only complete contracts can generate consumers. Availability still requires a verified host binding. */
export function generatableScientificOperation(id: string, host: ScientificOperationHost):
  ScientificOperationDescriptor | null {
  const availability = resolveScientificOperationAvailability(id, host);
  return availability.available && availability.descriptor?.schemaCompleteness === "complete"
    ? availability.descriptor : null;
}

export function scientificParameterFields(descriptor: ScientificOperationDescriptor):
  readonly ScientificParameterField[] {
  if (descriptor.schemaCompleteness !== "complete") return [];
  const schema = descriptor.parameterSchema;
  if (schema.type !== "object" || !schema.properties) return [];
  return Object.entries(schema.properties).map(([name, property]) => ({
    name, schema: property, required: schema.required?.includes(name) ?? false,
    editable: ["string", "number", "integer", "boolean"].includes(property.type ?? "") ||
      Boolean(property.enum && property.type === "string"),
  }));
}

export function scientificWorkflowNode(descriptor: ScientificOperationDescriptor,
  host: ScientificOperationHost): ScientificWorkflowNode | null {
  if (generatableScientificOperation(descriptor.id, host)?.id !== descriptor.id) return null;
  return {
    id: `operation.${descriptor.id}`, title: descriptor.title, module: descriptor.module,
    operationId: descriptor.id, inputSchema: descriptor.inputSchema,
    parameterSchema: descriptor.parameterSchema, outputSchema: descriptor.outputSchema,
    visualizationIds: descriptor.visualizationIds, validatorIds: descriptor.validatorIds,
  };
}

export function scientificOperationMarkdown(descriptor: ScientificOperationDescriptor): string {
  const lines = [`# ${descriptor.title}`, "", descriptor.description, "",
    `- ID: \`${descriptor.id}\``, `- Version: \`${descriptor.version}\``,
    `- Module: ${descriptor.module}`, `- Contract: ${descriptor.schemaCompleteness}`,
    `- Environments: ${descriptor.environments.join(", ")}`, "",
    "Registration does not establish availability on a particular host. Execution requires a verified implementation binding."];
  if (descriptor.schemaCompleteness === "complete") {
    for (const [heading, schema] of [["Input", descriptor.inputSchema],
      ["Parameters", descriptor.parameterSchema], ["Output", descriptor.outputSchema]] as const)
      lines.push("", `## ${heading}`, "", "```json", JSON.stringify(schema, null, 2), "```");
    lines.push("", `Validators: ${descriptor.validatorIds.join(", ") || "none registered"}.`,
      `Visualizations: ${descriptor.visualizationIds.join(", ") || "none registered"}.`);
  } else lines.push("", "Operation-specific input, parameter and output schemas are pending verification.");
  return `${lines.join("\n")}\n`;
}

export type ScientificBenchmarkSample = Readonly<{ durationMs: number }>;
export type ScientificBenchmarkReport = Readonly<{
  operationId: string;
  iterations: number;
  samples: readonly ScientificBenchmarkSample[];
  meanMs: number;
  maxMs: number;
}>;

/** Benchmark execution uses the caller's verified binding and a concrete fixture. */
export async function benchmarkScientificOperation(args: {
  id: string;
  host: ScientificOperationHost;
  input: unknown;
  parameters: unknown;
  iterations: number;
  execute: (input: unknown, parameters: unknown) => unknown | Promise<unknown>;
  now?: () => number;
}): Promise<ScientificBenchmarkReport> {
  const descriptor = generatableScientificOperation(args.id, args.host);
  if (!descriptor) throw new TypeError(`No complete verified operation: ${args.id}`);
  if (!Number.isInteger(args.iterations) || args.iterations < 1 || args.iterations > 1000)
    throw new RangeError("Benchmark iterations must be between 1 and 1000.");
  if (!validateDiscoveryJsonValue(descriptor.inputSchema, args.input) ||
      !validateDiscoveryJsonValue(descriptor.parameterSchema, args.parameters))
    throw new TypeError(`Invalid benchmark fixture for ${args.id}`);
  const now = args.now ?? (() => performance.now());
  const samples: ScientificBenchmarkSample[] = [];
  for (let index = 0; index < args.iterations; index += 1) {
    const started = now();
    const output = await args.execute(args.input, args.parameters);
    const durationMs = now() - started;
    const jsonOutput = JSON.parse(JSON.stringify(output, (_key, value) =>
      ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value));
    if (!Number.isFinite(durationMs) || durationMs < 0 ||
        !validateDiscoveryJsonValue(descriptor.outputSchema, jsonOutput))
      throw new TypeError(`Invalid benchmark result for ${args.id}`);
    samples.push({ durationMs });
  }
  return { operationId: descriptor.id, iterations: samples.length, samples,
    meanMs: samples.reduce((sum, item) => sum + item.durationMs, 0) / samples.length,
    maxMs: Math.max(...samples.map(item => item.durationMs)) };
}

export const generatableScientificWorkflowNodes = (host: ScientificOperationHost):
  readonly ScientificWorkflowNode[] => MATH3D_PLATFORM_DISCOVERY.list("scientific-operations")
    .filter((entry): entry is ScientificOperationDescriptor => entry.kind === "scientific-operations")
    .map(descriptor => scientificWorkflowNode(descriptor, host))
    .filter((node): node is ScientificWorkflowNode => node !== null);

export type ScientificResultInspection = Readonly<{
  operationId: string;
  metrics: readonly Readonly<{ id: string; title: string; value: number; units: string | null }>[];
  artifacts: ScientificResult["artifacts"];
}>;

/** Refuse stale or unregistered metric identities before presenting a retained result. */
export function inspectScientificResult(result: ScientificResult): ScientificResultInspection | null {
  const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations", result.operationId);
  if (!descriptor || descriptor.kind !== "scientific-operations") return null;
  const operation = descriptor as ScientificOperationDescriptor;
  if (operation.schemaCompleteness !== "complete" ||
      operation.capabilityIds.join("|") !== result.capabilityIds.join("|") ||
      !result.executionId || !result.sourceReference ||
      result.artifacts.some(artifact => !artifact.id || !artifact.type || !artifact.reference) ||
      result.metrics.some(metric => !Number.isFinite(metric.value) ||
        !(operation.references.metrics ?? []).includes(metric.id))) return null;
  return { operationId: result.operationId,
    metrics: result.metrics.map(metric => ({ ...metric,
      title: MATH3D_PLATFORM_DISCOVERY.get("metrics", metric.id)?.title ?? metric.id })),
    artifacts: result.artifacts };
}
