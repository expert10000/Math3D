import { createMixedWorkspaceDocument, createProjectNote, createProjectStudyFromDocuments, createQuantumStudyDocument,
  normalizeQuantumStudyDocument, linkQuantumSceneDocuments, pinProjectNoteAnchor, replaceMath3DProjectWorkspace,
  upsertMath3DProjectNote, viewerSourceFromDocument,
  upsertMath3DProjectQuantumScene, type Math3DProject, type ProjectQuantumSceneReference,
  type QuantumSceneDocument } from "@math3d/core";

export type VerifiedQwzStudy = { runId: string; resultSha256: string; references: ProjectQuantumSceneReference[] };
export type VerifiedStudy = VerifiedQwzStudy & { model?: "qwz" | "hofstadter" | "ssh";
  roles?: readonly string[]; title?: string };

/** Reverify every declared scene before publishing either document to a Project. */
export async function admitVerifiedQuantumStudy(base: Math3DProject, handoff: VerifiedStudy,
  verify: (reference: ProjectQuantumSceneReference) => Promise<QuantumSceneDocument>): Promise<Math3DProject> {
  const model = handoff.model ?? "qwz";
  if (handoff.references.length !== 2 || new Set(handoff.references.map(item => item.sceneFingerprint)).size !== 2)
    throw new TypeError("Study needs two distinct exact scene identities.");
  const documents = await Promise.all(handoff.references.map(async reference => {
    const document = await verify(reference);
    if (document.location.directory !== reference.directory || document.source.sceneFingerprint !== reference.sceneFingerprint ||
        document.source.provenance.runId !== handoff.runId ||
        document.source.provenance.resultSha256 !== handoff.resultSha256 ||
        document.source.provenance.model !== model) throw new TypeError("Verified study source differs from its declared run.");
    return document;
  }));
  let next = base;
  for (const reference of handoff.references) next = upsertMath3DProjectQuantumScene(next, reference);
  const existing = next.workspace.entries;
  const present = new Set(existing.filter(entry => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document")
    .map(entry => (entry.checkpoint as QuantumSceneDocument).source.sceneFingerprint));
  const added = documents.filter(document => !present.has(document.source.sceneFingerprint));
  const staged = [...existing, ...added.map(document => ({ module: "quantum" as const, checkpoint: document,
    expected: document.identity, replay: null }))];
  const linked = new Map(linkQuantumSceneDocuments(staged.filter(entry => entry.module === "quantum")
    .map(entry => entry.checkpoint as QuantumSceneDocument)).map(document => [document.source.sceneFingerprint, document]));
  const roles = handoff.roles ?? (model === "qwz" ? ["curvature", "bands"] : model === "ssh" ? ["chain", "bands"] : ["bands", "strip"]);
  if (roles.length !== documents.length || new Set(roles).size !== roles.length)
    throw new TypeError("Study panel roles are invalid.");
  const templateId = model === "qwz" && roles[0] === "curvature" && roles[1] === "bands" ? "qwz" :
    model === "ssh" && roles[0] === "chain" && roles[1] === "bands" ? "ssh" :
    model === "hofstadter" && roles[0] === "bands" && roles[1] === "strip" ? "hofstadter" : undefined;
  if (model === "ssh" && templateId !== "ssh") throw new TypeError("SSH Study needs chain and band views in that order.");
  const title = handoff.title ?? `${model} study · ${handoff.runId}`;
  const source = { model, runId: handoff.runId, resultSha256: handoff.resultSha256 };
  const panels = documents.map((document, index) => ({
    role: roles[index], sceneFingerprint: document.source.sceneFingerprint,
    selectedObjectId: null, sampleIndex: null }));
  const templated = createQuantumStudyDocument(title, source, panels, templateId);
  const checked = normalizeQuantumStudyDocument(templated, documents);
  if (model === "ssh" && !checked.ok) throw new TypeError(checked.errors.join(" "));
  const study = templateId && checked.ok ? checked.value : createQuantumStudyDocument(title, source, panels);
  const workspace = createMixedWorkspaceDocument({ ...next.workspace,
    quantumStudies: [...(next.workspace.quantumStudies ?? []).filter(item => item.id !== study.id), study],
    entries: staged.map(entry => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document"
      ? { ...entry, checkpoint: linked.get(entry.checkpoint.source.sceneFingerprint)! } : entry),
    activeDocumentIds: [...next.workspace.activeDocumentIds, ...added.map(document => document.identity.id)] });
  return replaceMath3DProjectWorkspace(next, workspace);
}

export const admitVerifiedQwzStudy = admitVerifiedQuantumStudy;

/** Give the verified SSH pair saved Project panes and one exact-source evidence Note per view. */
export function prepareSshProjectStudyEvidence(project: Math3DProject, handoff: VerifiedStudy): Math3DProject {
  const study = project.workspace.quantumStudies?.find(item => item.templateId === "ssh" &&
    item.source.runId === handoff.runId && item.source.resultSha256 === handoff.resultSha256 &&
    item.panels.every((panel, index) => panel.sceneFingerprint === handoff.references[index]?.sceneFingerprint));
  if (!study) throw new TypeError("A verified SSH chain and bands Study is required.");
  const documents = study.panels.map(panel => project.workspace.entries.find(entry => entry.module === "quantum" &&
    entry.checkpoint.format === "math3d.quantum-scene-document" &&
    entry.checkpoint.source.sceneFingerprint === panel.sceneFingerprint)?.checkpoint as QuantumSceneDocument | undefined);
  if (documents.some(item => !item) || !normalizeQuantumStudyDocument(study, documents as QuantumSceneDocument[]).ok)
    throw new TypeError("SSH Study source evidence is unavailable or inconsistent.");
  const pair = documents as QuantumSceneDocument[];
  const ids = pair.map(item => item.identity.id);
  const existing = project.workspace.studies?.some(item => item.title === study.title &&
    item.members.map(member => member.documentId).join(",") === ids.join(","));
  let next = existing ? project : createProjectStudyFromDocuments(project,
    ["ssh-verified-pair", study.source.runId, study.source.resultSha256], study.title, ids);
  for (const [index, document] of pair.entries()) {
    const role = study.panels[index]!.role;
    const note = createProjectNote({ projectId: next.identity.id,
      stableKey: ["ssh-study-evidence", study.id, role], kind: "text",
      title: `SSH ${role} source evidence`,
      body: `Run ${study.source.runId}; result SHA-256 ${study.source.resultSha256}; ${role} scene SHA-256 ${document.source.sceneFingerprint}. Dataset hashes: ${document.source.datasets.map(item => `${item.id} ${item.sha256}`).join("; ")}. Saved identifiers require independent bundle verification on opening; producer claims are not authenticated and Math3D infers no edge/bulk classification.`,
      anchor: pinProjectNoteAnchor(next, { kind: "document", source: viewerSourceFromDocument(document) }),
      createdAt: Date.now() });
    next = upsertMath3DProjectNote(next, note);
  }
  return next;
}
