import { describe, expect, it } from "vitest";
import { createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { createSageExecutionRegistry } from "./sageOperationExecution";
import { runSageAlgebraReconstruction } from "./sageAlgebraReconstruction";

describe("SAGE-A04 shared broker handoff", () => {
  it("runs a validated Q snapshot and checks the worker's exact result metadata", async () => {
    const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
      relations: [], committedSelection: null, constructions: [] });
    let project = createMath3DProject(workspace, { stableKey: "sage-a04-handoff" });
    const id = createProjectAlgebraObjectId(project.identity.id, "Q");
    const q = createAlgebraObjectRecord({ id, label: "Q", revision: 1, definition: { kind: "rational-field" } });
    project = upsertMath3DProjectAlgebraObject(project, q);
    const calls: unknown[] = [];
    const registry = createSageExecutionRegistry({
      health: async (backend) => ({ engine: "sagemath", engineVersion: "10.10", status: "ok",
        available: backend === "docker", operations: ["sage.algebra.reconstruct"] }),
      run: async (request) => { calls.push(request); return { engine: "sagemath", engineVersion: "10.10",
        operation: request.operation, success: true, latex: "\\mathbb{Q}", warnings: [],
        result: { format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
          target: { objectId: id, revision: 1 }, kind: "rational-field", definitionHash: q.contentHash,
          text: "Rational Field", latex: "\\mathbb{Q}", characteristic: "0", isField: true } }; },
    });
    const handle = runSageAlgebraReconstruction(project, { objectId: id, revision: 1 }, registry);
    const { broker, result } = await handle.promise;
    expect(broker.ok).toBe(true);
    expect(result).toMatchObject({ target: { objectId: id, revision: 1 }, definitionHash: q.contentHash,
      characteristic: "0", isField: true });
    expect(calls).toMatchObject([{ operation: "sage.algebra.reconstruct", backend: "docker",
      params: { format: "math3d.sage-algebra-reconstruction", objects: [{ id }] } }]);
  });
});
