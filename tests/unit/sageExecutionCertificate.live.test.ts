import { expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest,
  captureProjectResources, createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraEvidence, createProjectAlgebraObjectId,
  exportProjectPackage, parseProjectPackage, upsertMath3DProjectAlgebraObject } from "../../packages/core/src/index";

it.skipIf(process.env.MATH3D_SAGE_LIVE !== "1")(
  "SAGE-F05 certifies a live Docker Sage reconstruction and independently reopens it", async () => {
    let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
      results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
    { stableKey: "sage-f05-live", title: "Certified Sage result" });
    const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
      revision: 1, label: "Q", definition: { kind: "rational-field" } });
    project = upsertMath3DProjectAlgebraObject(project, q);
    const ring = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
      revision: 1, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["x", "y"],
        monomialOrder: "degrevlex" } });
    project = upsertMath3DProjectAlgebraObject(project, ring);
    const request = buildAlgebraOperationRequest(project, { objectId: ring.id, revision: 1 },
      "sage.algebra.reconstruct", "docker", {});
    const jobId = "f05-live-reconstruction";
    const http = await fetch("http://127.0.0.1:8767/run", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: request.operation, params: request.params, backend: "docker", jobId }) });
    expect(http.status).toBe(200);
    const response = await http.json() as { success: boolean; operation: string; engine: string;
      engineVersion: string; result: unknown; elapsedMs?: number; warnings: string[]; error?: string };
    expect(response.success, response.error).toBe(true);
    expect(response.operation).toBe(request.operation);
    const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects!, request,
      response.result, { engine: "sagemath", version: response.engineVersion, backend: "docker",
        jobId, elapsedMs: response.elapsedMs ?? 0, warnings: response.warnings });
    expect(evidence.certificate?.runtime.sageVersion).toBe(response.engineVersion);
    expect(evidence.certificate?.sources.map((item) => item.objectId)).toContain(q.id);
    const saved = addMath3DProjectAlgebraEvidence(project, evidence);
    const exported = exportProjectPackage(saved, captureProjectResources(saved, () => null, true));
    expect(parseProjectPackage(exported).project.algebraEvidence?.[0].certificate).toEqual(evidence.certificate);
  }, 30_000);
