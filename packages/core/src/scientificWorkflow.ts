import { resolveScientificOperationAvailability,
  validateDiscoveryJsonValue, type ScientificOperationHost } from "./platformDiscovery";

export type ScientificWorkflowStep = Readonly<{
  id: string;
  operationId: string;
  /** JSON input. {"$from":"step-id","path":"field"} connects a prior output. */
  input: unknown;
  parameters: unknown;
}>;

export type ScientificWorkflowBinding = Readonly<{
  implementationId: string;
  execute: (input: unknown, parameters: unknown) => unknown | Promise<unknown>;
}>;

export type ScientificWorkflowRun = Readonly<{
  steps: readonly Readonly<{ id: string; operationId: string; output: unknown }>[];
}>;

const toJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item) =>
  ArrayBuffer.isView(item) ? Array.from(item as unknown as ArrayLike<number>) : item));

function resolveInput(value: unknown, outputs: ReadonlyMap<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map(item => resolveInput(item, outputs));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if ("$from" in record) {
    if (Object.keys(record).some(key => !["$from", "path"].includes(key)) ||
        typeof record.$from !== "string" ||
        (record.path !== undefined && typeof record.path !== "string"))
      throw new TypeError("Invalid workflow output reference.");
    let output = outputs.get(record.$from);
    if (output === undefined) throw new TypeError(`Workflow step ${record.$from} has not run.`);
    for (const segment of (record.path as string | undefined)?.split(".").filter(Boolean) ?? []) {
      if (segment === "__proto__" || segment === "constructor" || segment === "prototype" ||
          !output || typeof output !== "object" ||
          !Object.prototype.hasOwnProperty.call(output, segment))
        throw new TypeError(`Workflow output path is unavailable: ${record.$from}.${record.path}`);
      output = (output as Record<string, unknown>)[segment];
    }
    return output;
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) =>
    [key, resolveInput(item, outputs)]));
}

/** Sequential graph executor. Only previously completed nodes can supply a port. */
export async function runScientificWorkflow(args: {
  steps: readonly ScientificWorkflowStep[];
  host: ScientificOperationHost;
  bindings: Readonly<Record<string, ScientificWorkflowBinding>>;
}): Promise<ScientificWorkflowRun> {
  if (args.steps.length < 1 || args.steps.length > 32)
    throw new RangeError("A scientific workflow must contain 1 to 32 steps.");
  const outputs = new Map<string, unknown>();
  const completed: { id: string; operationId: string; output: unknown }[] = [];
  for (const step of args.steps) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(step.id) || outputs.has(step.id))
      throw new TypeError(`Invalid or duplicate workflow step: ${step.id}`);
    const availability = resolveScientificOperationAvailability(step.operationId, args.host);
    const descriptor = availability.descriptor;
    const binding = args.bindings[step.operationId];
    if (!availability.available || !descriptor || !binding ||
        binding.implementationId !== descriptor.implementationId)
      throw new TypeError(`No verified workflow binding for ${step.operationId}.`);
    const input = resolveInput(step.input, outputs);
    const parameters = resolveInput(step.parameters, outputs);
    if (!validateDiscoveryJsonValue(descriptor.inputSchema, input) ||
        !validateDiscoveryJsonValue(descriptor.parameterSchema, parameters))
      throw new TypeError(`Workflow step ${step.id} does not match ${step.operationId} input contract.`);
    const output = toJson(await binding.execute(input, parameters));
    if (!validateDiscoveryJsonValue(descriptor.outputSchema, output))
      throw new TypeError(`Workflow step ${step.id} violates ${step.operationId} output contract.`);
    outputs.set(step.id, output);
    completed.push({ id: step.id, operationId: step.operationId, output });
  }
  return { steps: completed };
}
