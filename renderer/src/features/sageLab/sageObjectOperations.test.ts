import { describe, expect, it } from "vitest";
import { ALGEBRA_OPERATION_REGISTRY } from "../../../../packages/core/src/algebraOperationRegistry";
import { SAGE_JOB_OPERATIONS } from "../../services/sageOperationExecution";

describe("SAGE-B01 broker capability mapping", () => {
  it("maps every object operation to one registered bounded Sage capability", () => {
    for (const operation of ALGEBRA_OPERATION_REGISTRY) {
      expect(SAGE_JOB_OPERATIONS[operation.id].type).toBe(operation.capability);
      expect(operation.executionMode).toBe("bounded");
      expect(operation.outputSchema).toMatch(/(?:\/v1|result-v1)$/);
      expect(operation.backends).not.toContain("local");
    }
  });
});
