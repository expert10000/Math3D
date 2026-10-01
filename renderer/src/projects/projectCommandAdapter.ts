import { createCommandEnvelope, normalizeMath3DProject, structuralHash, type CanonicalJsonValue, type CommandDefinition, type Math3DProject } from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";

const definitions: readonly CommandDefinition<Math3DProject>[] = [{
  type: "projects.snapshot.replace",
  validate: (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).sort().join("|") !== "expectedHash|project") return { ok: false, errors: ["Invalid project transaction."] };
    const value = payload as Readonly<Record<string, CanonicalJsonValue>>;
    if (typeof value.expectedHash !== "string") return { ok: false, errors: ["Invalid project transaction hash."] };
    const project = normalizeMath3DProject(value.project);
    return project.ok ? { ok: true, value: payload } : project;
  },
  project: (state, payload) => {
    const value = payload as { expectedHash: string; project: Math3DProject };
    if (structuralHash(state) !== value.expectedHash || value.project.identity.id !== state.identity.id) throw new Error("Project changed before the transaction.");
    return value.project;
  },
}];

/** Saved-project organization uses the shared kernel's reversible transactions. */
export class ProjectCommandAdapter {
  readonly #kernel;
  #sequence = 0;
  constructor(project: Math3DProject) {
    const normalized = normalizeMath3DProject(project);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    this.#kernel = createInMemoryDocumentKernel({ initialState: normalized.value, commandDefinitions: definitions, historyLimit: 10 });
  }
  project(): Math3DProject { return this.#kernel.query((state) => state) as Math3DProject; }
  history() { return this.#kernel.historyStatus(); }
  commit(next: Math3DProject): Math3DProject {
    const before = this.project(), id = `project-edit-${++this.#sequence}`;
    const command = (suffix: string, source: Math3DProject, project: Math3DProject) => createCommandEnvelope({ commandId: `${id}-${suffix}`, origin: { kind: "interactive" },
      command: { type: "projects.snapshot.replace", payload: { expectedHash: structuralHash(source), project } as unknown as CanonicalJsonValue } });
    const result = this.#kernel.transact({ transactionId: id, commands: [command("forward", before, next)],
      history: { kind: "reversible", inverseCommands: [command("inverse", next, before)] } });
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join(" "));
    return this.project();
  }
  undo(): Math3DProject { const result = this.#kernel.undo(); if (!result.ok) throw new Error("No project change to undo."); return this.project(); }
  redo(): Math3DProject { const result = this.#kernel.redo(); if (!result.ok) throw new Error("No project change to redo."); return this.project(); }
}
