import { adoptMixedWorkspaceProject, canonicalJsonStringify, parseMath3DProject,
  parseMixedWorkspaceDocument, parseWorkspaceProjectHandoff, sha256Checksum,
  type Math3DProject, type MixedWorkspaceDocument } from "@math3d/core";

export type ProjectMigrationSource = Readonly<{
  format: "math3d.project" | "math3d.mixed-workspace" | "math3d.project-handoff";
  version: number;
  byteLength: number;
  sha256: string;
}>;
export type ProjectMigrationStep = Readonly<{ code: "preserve" | "adopt-workspace" | "adopt-handoff"; description: string }>;
export type ProjectMigrationPlan = Readonly<{
  source: ProjectMigrationSource;
  project: Math3DProject;
  steps: readonly ProjectMigrationStep[];
  originalBytes: Uint8Array;
  requiresCopy: boolean;
}>;

const sameWorkspace = (project: Math3DProject, source: MixedWorkspaceDocument) => {
  if (canonicalJsonStringify(project.workspace) !== canonicalJsonStringify(source))
    throw new TypeError("Migration changed a saved workspace, result, revision, selection or reference.");
  return project;
};

/** The plan never guesses a producer's app version or rewrites historical evidence. */
export const planProjectMigration = (input: Uint8Array | string): ProjectMigrationPlan => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Unsupported Project file.");
  const envelope = value as Record<string, unknown>;
  const format = envelope.format;
  let project: Math3DProject, version: number, steps: ProjectMigrationStep[];
  if (format === "math3d.project") {
    version = Number(envelope.schemaVersion);
    if (version !== 1) throw new TypeError(`Unsupported or future Project schema version ${String(envelope.schemaVersion)}.`);
    project = parseMath3DProject(raw);
    steps = [{ code: "preserve", description: "Validate and preserve the named Project schema v1 without changing its saved identity or evidence." }];
  } else if (format === "math3d.mixed-workspace") {
    version = Number(envelope.schemaVersion);
    if (version !== 1) throw new TypeError(`Unsupported or future mixed-workspace schema version ${String(envelope.schemaVersion)}.`);
    const workspace = parseMixedWorkspaceDocument(raw);
    project = sameWorkspace(adoptMixedWorkspaceProject(workspace, "Imported workspace"), workspace);
    steps = [{ code: "adopt-workspace", description: "Wrap the verified mixed workspace in a new named Project; retain every saved source and result unchanged." }];
  } else if (format === "math3d.project-handoff") {
    version = Number(envelope.version);
    if (version !== 2) throw new TypeError(`Unsupported or future Graph handoff version ${String(envelope.version)}.`);
    const handoff = parseWorkspaceProjectHandoff(raw);
    project = sameWorkspace(adoptMixedWorkspaceProject(handoff.project, "Imported Graph workspace"), handoff.project);
    steps = [{ code: "adopt-handoff", description: "Verify the Graph handoff hashes, then wrap its exact workspace in a named Project." }];
  } else throw new TypeError("Unsupported Project format or future version.");
  return { source: { format, version, byteLength: bytes.byteLength, sha256: sha256Checksum(bytes) },
    project, steps, originalBytes: bytes, requiresCopy: steps[0]!.code !== "preserve" };
};
