import {
  MATH3D_WORKER_OPERATION_REGISTRY,
  getMath3DWorkerOperation,
  type Math3DWorkerOperationDefinition,
  type Math3DWorkerOperationId,
  type ScientificJobRequest,
} from "@math3d/core";
import type {
  ScientificBackendCapabilitySnapshot,
  ScientificBrokerOutcome,
  ScientificBrokerRouteOptions,
} from "./scientificExecutionBroker";
import { ScientificExecutionBroker } from "./scientificExecutionBroker";

export const EXECUTION_SERVICE_SCHEMA_VERSION = 1 as const;

export type ExecutionOperationCapability = Readonly<{
  operation: Math3DWorkerOperationDefinition;
  availableBackends: readonly ScientificBackendCapabilitySnapshot[];
  unavailableBackends: readonly ScientificBackendCapabilitySnapshot[];
}>;

/**
 * The feature-facing facade over the existing transport-neutral scientific
 * broker. It intentionally owns no process, worker, DOM, or network detail.
 */
export class ExecutionService {
  readonly #broker: ScientificExecutionBroker;

  constructor(broker: ScientificExecutionBroker) {
    this.#broker = broker;
  }

  operation(id: string): Math3DWorkerOperationDefinition | null {
    return getMath3DWorkerOperation(id);
  }

  async discoverCapabilities(): Promise<readonly ExecutionOperationCapability[]> {
    const snapshots = await this.#broker.discoverCapabilities();
    const capabilityFor = (operationId: Math3DWorkerOperationId, snapshot: ScientificBackendCapabilitySnapshot): boolean =>
      snapshot.operations.some((capability) => capability.operationType === operationId);

    return Object.freeze(MATH3D_WORKER_OPERATION_REGISTRY.map((operation) => Object.freeze({
      operation,
      availableBackends: Object.freeze(snapshots.filter((snapshot) =>
        snapshot.availability === "available" && capabilityFor(operation.id, snapshot)
      )),
      unavailableBackends: Object.freeze(snapshots.filter((snapshot) =>
        snapshot.availability === "unavailable" || !capabilityFor(operation.id, snapshot)
      )),
    })));
  }

  async submit(
    request: ScientificJobRequest,
    routeOptions: ScientificBrokerRouteOptions = {}
  ): Promise<ScientificBrokerOutcome> {
    if (!getMath3DWorkerOperation(request.operation.type)) {
      throw new RangeError(`Operation '${request.operation.type}' is not registered in the Math3D worker platform.`);
    }
    return this.#broker.submit(request, routeOptions);
  }

  cancel(jobId: string): boolean {
    return this.#broker.cancel(jobId);
  }
}

export const createExecutionService = (broker: ScientificExecutionBroker): ExecutionService => new ExecutionService(broker);
