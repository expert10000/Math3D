import { canonicalJsonStringify, createStableDocumentId, MAX_PROJECT_WORKBOOK_BYTES, sha256Checksum,
  type Math3DProject, type ProjectWorkbookReference } from "@math3d/core";
import { WORKBOOK_STAGE_ORDER, validateWorkbookDependencies, type Workbook } from "@math3d/workbook";

const validateWorkbook = (value: Workbook): void => {
  if (!value || typeof value.id !== "string" || !value.id || typeof value.title !== "string" ||
    !value.title.trim() || value.title.trim() !== value.title || value.title.length > 160 ||
    !Number.isSafeInteger(value.updatedAt) || !Array.isArray(value.stages) || value.stages.length !== WORKBOOK_STAGE_ORDER.length)
    throw new TypeError("Invalid Workbook title, identity, or stages.");
  const ids = new Set<string>();
  for (const [index, stage] of value.stages.entries()) {
    if (stage.id !== WORKBOOK_STAGE_ORDER[index]!.id || !Array.isArray(stage.blocks)) throw new TypeError("Invalid Workbook stage order.");
    for (const block of stage.blocks) {
      if (!block || typeof block.id !== "string" || !block.id || ids.has(block.id) ||
        typeof block.type !== "string" || typeof block.title !== "string") throw new TypeError("Invalid Workbook block.");
      ids.add(block.id);
    }
  }
  validateWorkbookDependencies(value);
};

/** Adoption creates a Project copy; subsequent saves of that copy advance its resource revision. */
export const prepareProjectWorkbook = (project: Math3DProject, source: Workbook, token: string): {
  workbook: Workbook; reference: ProjectWorkbookReference; bytes: Uint8Array; adopted: boolean;
} => {
  validateWorkbook(source);
  const existing = project.workbooks?.find((item) => item.id === source.id);
  const adopted = !existing;
  const workbook: Workbook = JSON.parse(JSON.stringify(source));
  if (adopted) workbook.id = createStableDocumentId("workbook", { projectId: project.identity.id, sourceId: source.id, token });
  const bytes = new TextEncoder().encode(canonicalJsonStringify(workbook));
  if (bytes.length > MAX_PROJECT_WORKBOOK_BYTES) throw new TypeError("Workbook exceeds the 8 MiB Project limit.");
  const checksum = sha256Checksum(bytes);
  const reference: ProjectWorkbookReference = {
    id: workbook.id as ProjectWorkbookReference["id"], title: workbook.title,
    revision: existing ? existing.revision + Number(existing.checksum !== checksum) : 1,
    checksum, byteLength: bytes.length,
  };
  return { workbook, reference, bytes, adopted };
};

export const readProjectWorkbook = (bytes: Uint8Array, reference: ProjectWorkbookReference): Workbook => {
  if (bytes.length !== reference.byteLength || sha256Checksum(bytes) !== reference.checksum) throw new TypeError("Workbook resource does not match its Project reference.");
  const workbook = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Workbook;
  validateWorkbook(workbook);
  if (workbook.id !== reference.id || workbook.title !== reference.title ||
    canonicalJsonStringify(workbook) !== new TextDecoder().decode(bytes)) throw new TypeError("Invalid Project Workbook payload.");
  return workbook;
};
