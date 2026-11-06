import { canonicalJsonStringify, parseProjectAlgebraEvidence, structuralHash,
  type Math3DProject } from "@math3d/core";
import type { Workbook } from "@math3d/workbook";

export const ALGEBRA_MANIFEST_FORMAT = "math3d.algebra-repro-manifest" as const;
export type AlgebraReproManifest = Readonly<{
  format: typeof ALGEBRA_MANIFEST_FORMAT; schemaVersion: 1; projectId: string;
  executionPolicy: "inert-on-import"; trustedCodeWarning: string;
  objects: readonly Readonly<{ id: string; archived: boolean; revisions: readonly unknown[] }>[];
  operations: readonly Readonly<{ id: string; targetHash: string; request: unknown; resultHash: string;
    runtime: unknown; certificate: unknown; result: unknown | null }>[];
  recipes: readonly unknown[];
  workbookBlocks: readonly Readonly<{ workbookId: string; blockId: string; title: string; kind: string;
    source: unknown; trustedCode: string | null; trustedCodeHash: string | null; resultHash: string | null }>[];
  contentHash: string;
}>;
const warning = "Trusted Sage code is inert data in this manifest. Review it and grant explicit local trust before any execution.";
const bounded = (value: unknown): boolean => new TextEncoder().encode(canonicalJsonStringify(value)).length <= 8 * 1024 * 1024;

/** Deterministic data export; importing this type never dispatches an operation or executes trusted code. */
export const createAlgebraReproManifest = (project: Math3DProject, books: readonly Workbook[],
  selected?: readonly string[], includeResults = false): AlgebraReproManifest => {
  const objects = (project.algebraObjects ?? []).map((entry) => ({ id: entry.id, archived: entry.archived,
    revisions: entry.revisions }));
  const operations = (project.algebraEvidence ?? []).map((item) => {
    parseProjectAlgebraEvidence(item, project.identity.id, project.algebraObjects ?? []);
    return { id: item.id, targetHash: item.targetHash, request: item.request, resultHash: item.resultHash,
      runtime: item.runtime, certificate: item.certificate ?? null, result: includeResults ? item.result : null };
  });
  const workbookBlocks = books.flatMap((book) => book.stages.flatMap((stage) => stage.blocks
    .filter((block) => !selected || selected.includes(block.id))
    .filter((block) => !!(block.algebraObject || block.algebraResult || block.sageCode))
    .map((block) => ({ workbookId: book.id, blockId: block.id, title: block.title, kind: block.type,
      source: block.algebraObject?.source ?? (block.algebraResult ? {
        objectId: block.algebraResult.objectId, revision: block.algebraResult.revision,
        objectHash: block.algebraResult.objectHash, evidenceId: block.algebraResult.evidence.id } : null),
      trustedCode: block.sageCode?.code ?? null,
      trustedCodeHash: block.sageCode ? structuralHash(block.sageCode.code) : null,
      resultHash: block.algebraObject?.runs.at(-1)?.outputHash ?? block.algebraResult?.evidence.resultHash ??
        (block.sageCode?.runs.at(-1)?.output ? structuralHash(block.sageCode.runs.at(-1)!.output) : null) }))))
    .sort((a, b) => a.workbookId.localeCompare(b.workbookId) || a.blockId.localeCompare(b.blockId));
  const body = { format: ALGEBRA_MANIFEST_FORMAT, schemaVersion: 1 as const, projectId: project.identity.id,
    executionPolicy: "inert-on-import" as const, trustedCodeWarning: warning,
    objects, operations, recipes: project.algebraRecipes ?? [], workbookBlocks };
  if (!bounded(body)) throw new TypeError("Algebra manifest exceeds the 8 MiB export limit.");
  return { ...body, contentHash: structuralHash(body) };
};

/** Structural import only; caller may compare the manifest with an independently loaded Project. */
export const parseAlgebraReproManifest = (value: unknown): AlgebraReproManifest => {
  if (!value || typeof value !== "object" || Array.isArray(value) || !bounded(value))
    throw new TypeError("Invalid or oversized algebra manifest.");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join("|") !== "contentHash|executionPolicy|format|objects|operations|projectId|recipes|schemaVersion|trustedCodeWarning|workbookBlocks" ||
      data.format !== ALGEBRA_MANIFEST_FORMAT || data.schemaVersion !== 1 ||
      data.executionPolicy !== "inert-on-import" || data.trustedCodeWarning !== warning ||
      typeof data.projectId !== "string" || !Array.isArray(data.objects) || !Array.isArray(data.operations) ||
      !Array.isArray(data.recipes) || !Array.isArray(data.workbookBlocks) ||
      data.contentHash !== structuralHash(Object.fromEntries(Object.entries(data).filter(([key]) => key !== "contentHash"))))
    throw new TypeError("Algebra manifest schema or checksum mismatch.");
  return JSON.parse(canonicalJsonStringify(data)) as AlgebraReproManifest;
};

export const inspectAlgebraReproManifest = (manifest: AlgebraReproManifest, project: Math3DProject) => {
  const checked = parseAlgebraReproManifest(manifest);
  if (checked.projectId !== project.identity.id) throw new TypeError("Algebra manifest belongs to another Project.");
  for (const source of checked.objects) {
    const current = project.algebraObjects?.find((item) => item.id === source.id);
    if (!current || current.archived !== source.archived ||
        canonicalJsonStringify(current.revisions) !== canonicalJsonStringify(source.revisions))
      throw new TypeError(`Algebra manifest object ${source.id} differs from the Project.`);
  }
  for (const source of checked.operations) {
    const current = project.algebraEvidence?.find((item) => item.id === source.id);
    if (!current || current.resultHash !== source.resultHash || current.targetHash !== source.targetHash ||
        canonicalJsonStringify(current.request) !== canonicalJsonStringify(source.request) ||
        canonicalJsonStringify(current.runtime) !== canonicalJsonStringify(source.runtime) ||
        canonicalJsonStringify(current.certificate ?? null) !== canonicalJsonStringify(source.certificate) ||
        (source.result !== null && canonicalJsonStringify(current.result) !== canonicalJsonStringify(source.result)))
      throw new TypeError(`Algebra manifest operation ${source.id} differs from the Project.`);
  }
  if (canonicalJsonStringify(checked.recipes) !== canonicalJsonStringify(project.algebraRecipes ?? []))
    throw new TypeError("Algebra manifest recipes differ from the Project.");
  for (const block of checked.workbookBlocks) {
    if (block.trustedCode !== null && structuralHash(block.trustedCode) !== block.trustedCodeHash)
      throw new TypeError(`Algebra manifest Workbook code hash differs for ${block.blockId}.`);
  }
  return { objects: checked.objects.length, operations: checked.operations.length,
    recipes: checked.recipes.length, workbookBlocks: checked.workbookBlocks.length,
    trustedCodeBlocks: checked.workbookBlocks.filter((item) => item.trustedCode !== null).length };
};

export const algebraReproManifestMarkdown = (manifest: AlgebraReproManifest): string => {
  const checked = parseAlgebraReproManifest(manifest);
  const lines = ["# Math3D algebra reproducibility report", "", `Project: ${checked.projectId}`,
    `Manifest hash: ${checked.contentHash}`, "", checked.trustedCodeWarning, "", "## Exact objects", ""];
  for (const item of checked.objects) for (const raw of item.revisions) {
    const record = raw as { label: string; kind: string; revision: number; contentHash: string; definition: unknown };
    lines.push(`- ${JSON.stringify(record.label)} · ${record.kind} @${record.revision} · ${record.contentHash}`,
      `  Definition: ${canonicalJsonStringify(record.definition)}`);
  }
  lines.push("", "## Bounded operations", "");
  for (const item of checked.operations) {
    const request = item.request as { operation: string; backend: string; params: unknown };
    const runtime = item.runtime as { version: string };
    lines.push(`- ${request.operation} · ${request.backend} · Sage ${runtime.version} · result ${item.resultHash}`,
      `  Inputs: ${canonicalJsonStringify(request.params)}`);
  }
  lines.push("", `Recipes: ${checked.recipes.length}; selected Workbook algebra/code blocks: ${checked.workbookBlocks.length}.`,
    "Import is inert: no operation or trusted Sage code runs automatically.");
  return lines.join("\n");
};
