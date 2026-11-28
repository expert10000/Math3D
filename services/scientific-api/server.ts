import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { MATH3D_PLATFORM_DISCOVERY, listAvailableScientificOperations,
  scientificOperationMarkdown, validateDiscoveryJsonValue, runScientificWorkflow,
  generatableScientificWorkflowNodes,
  type ScientificWorkflowStep, type ScientificOperationDescriptor } from "@math3d/core";
import { SCIENTIFIC_OPERATION_BINDINGS } from "../../renderer/src/scientificOperationBindings";

type JsonRecord = Record<string, unknown>;
const handlers = SCIENTIFIC_OPERATION_BINDINGS;

const verifiedImplementationIds = Object.freeze(Object.keys(handlers).map(id => {
  const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations", id) as
    ScientificOperationDescriptor | null;
  if (!descriptor ||
      descriptor.schemaCompleteness !== "complete" ||
      !descriptor.environments.includes("server"))
    throw new TypeError(`Server handler has no complete contract: ${id}`);
  return descriptor.implementationId;
}));

const available = () => listAvailableScientificOperations({
  environment: "server", implementations: verifiedImplementationIds,
}).filter(descriptor => descriptor.id in handlers);

const json = (response: ServerResponse, code: number, value: unknown) => {
  const body = JSON.stringify(value, (_key, item) =>
    ArrayBuffer.isView(item) ? Array.from(item as unknown as ArrayLike<number>) : item);
  response.writeHead(code, { "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
};

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new RangeError("Request body exceeds 8 MiB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Loopback by default; a public deployment needs its own authentication proxy. */
export function createScientificApiServer() {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (request.method === "GET" && path === "/v1/operations") {
        json(response, 200, { operations: available(),
          verifiedImplementationIds });
        return;
      }
      if (request.method === "GET" && path === "/v1/workflow-nodes") {
        json(response, 200, { nodes: generatableScientificWorkflowNodes({
          environment: "server", implementations: verifiedImplementationIds,
        }).filter(node => node.operationId in handlers) });
        return;
      }
      if (request.method === "POST" && path === "/v1/workflows/execute") {
        const body = await readJson(request) as { steps?: ScientificWorkflowStep[] };
        if (!body || !Array.isArray(body.steps)) {
          json(response, 400, { error: "Workflow steps are required." }); return;
        }
        const result = await runScientificWorkflow({ steps: body.steps,
          host: { environment: "server", implementations: verifiedImplementationIds },
          bindings: handlers });
        json(response, 200, result);
        return;
      }
      const match = /^\/v1\/operations\/([\w.-]+)(\/execute|\/docs)?$/.exec(path);
      const descriptor = match ? available().find(item => item.id === match[1]) : null;
      if (!descriptor) { json(response, 404, { error: "Unknown or unavailable operation." }); return; }
      if (request.method === "GET" && match?.[2] === "/docs") {
        json(response, 200, { markdown: scientificOperationMarkdown(descriptor) });
        return;
      }
      if (request.method !== "POST" || match?.[2] !== "/execute") {
        json(response, 405, { error: "Method not allowed." }); return;
      }
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        json(response, 400, { error: "Request must be an object." }); return;
      }
      const { input, parameters = {} } = body as JsonRecord;
      if (!validateDiscoveryJsonValue(descriptor.inputSchema, input) ||
          !validateDiscoveryJsonValue(descriptor.parameterSchema, parameters)) {
        json(response, 400, { error: "Input or parameters do not match the operation contract." }); return;
      }
      const result = await handlers[descriptor.id].execute(input, parameters);
      const normalized = JSON.parse(JSON.stringify(result, (_key, item) =>
        ArrayBuffer.isView(item) ? Array.from(item as unknown as ArrayLike<number>) : item));
      if (!validateDiscoveryJsonValue(descriptor.outputSchema, normalized))
        throw new TypeError(`Server result violates ${descriptor.id} output contract.`);
      json(response, 200, { operationId: descriptor.id, output: normalized });
    } catch (error) {
      json(response, error instanceof SyntaxError || error instanceof RangeError ||
        error instanceof TypeError ? 400 : 500,
      { error: error instanceof Error ? error.message : "Operation failed." });
    }
  });
}
