import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, structuralHash, upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { createSageExecutionRegistry } from "./sageOperationExecution";
import { runSageAlgebraDomainInspection } from "./sageAlgebraDomains";

describe("SAGE-A05 shared broker handoff", () => {
  it("returns directional coercion metadata for exact Project revisions", async () => {
    const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
      relations: [], committedSelection: null, constructions: [] });
    let project = createMath3DProject(workspace, { stableKey: "sage-a05-handoff" });
    const z = createProjectAlgebraObjectId(project.identity.id, "Z");
    const q = createProjectAlgebraObjectId(project.identity.id, "Q");
    const zRecord = createAlgebraObjectRecord({ id: z, label: "Z", revision: 1, definition: { kind: "integer-ring" } });
    const qRecord = createAlgebraObjectRecord({ id: q, label: "Q", revision: 1, definition: { kind: "rational-field" } });
    project = upsertMath3DProjectAlgebraObject(project, zRecord);
    project = upsertMath3DProjectAlgebraObject(project, qRecord);
    const zRef = { objectId: z, revision: 1 }, qRef = { objectId: q, revision: 1 };
    const descriptor = (ref: typeof zRef, hash: typeof zRecord.contentHash, kind: "integer-ring" | "rational-field") => ({
      ref, definitionHash: hash, kind, text: kind === "integer-ring" ? "Integer Ring" : "Rational Field",
      characteristic: "0", isField: kind === "rational-field", isCommutative: true, isExact: true,
      coefficientDomain: null, variables: [], monomialOrder: null,
    });
    const zDomain = descriptor(zRef, zRecord.contentHash, "integer-ring");
    const qDomain = descriptor(qRef, qRecord.contentHash, "rational-field");
    const calls: unknown[] = [];
    const registry = createSageExecutionRegistry({
      health: async (backend) => ({ engine: "sagemath", engineVersion: "10.10", status: "ok",
        available: backend === "docker", operations: ["sage.algebra.inspectDomains"] }),
      run: async (request) => { calls.push(request); return { engine: "sagemath", engineVersion: "10.10",
        operation: request.operation, success: true, latex: "", warnings: [], result: {
          format: "math3d.sage-algebra-domain-inspection-result", schemaVersion: 1,
          left: zDomain, right: qDomain,
          leftToRight: { source: zRef, target: qRef, sourceHash: zRecord.contentHash,
            targetHash: qRecord.contentHash, status: "canonical", mapId: structuralHash({ schemaVersion: 1,
              source: { ...zRef, definitionHash: zRecord.contentHash },
              target: { ...qRef, definitionHash: qRecord.contentHash } }), error: null },
          rightToLeft: { source: qRef, target: zRef, sourceHash: qRecord.contentHash,
            targetHash: zRecord.contentHash, status: "incompatible", mapId: null,
            error: { code: "NO_CANONICAL_COERCION", message: "Choose a compatible parent.",
              sourceCharacteristic: "0", targetCharacteristic: "0" } },
        } }; },
    });
    const handle = runSageAlgebraDomainInspection(project, zRef, qRef, registry);
    const { broker, result } = await handle.promise;
    expect(broker.ok).toBe(true);
    expect(result?.leftToRight.status).toBe("canonical");
    expect(result?.rightToLeft.error?.code).toBe("NO_CANONICAL_COERCION");
    expect(calls).toMatchObject([{ operation: "sage.algebra.inspectDomains", backend: "docker",
      params: { format: "math3d.sage-algebra-domain-inspection", left: { target: zRef }, right: { target: qRef } } }]);
  });
});
