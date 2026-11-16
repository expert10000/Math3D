import { configureProjectStudy, createMixedWorkspaceDocument, createProjectNote,
  createProjectStudyFromDocuments, createQuantumStudyFromTemplate, pinProjectNoteAnchor,
  replaceMath3DProjectWorkspace, upsertMath3DProjectNote, upsertMath3DProjectQuantumScene,
  viewerSourceFromDocument, type Math3DProject, type ProjectQuantumSceneReference } from "@math3d/core";
import type { QuantumSceneOpenResponse } from "../components/QuantumScenePreview";
import { quantumFieldDocumentFromVerifiedOpen, quantumSceneDocumentFromVerifiedOpen } from "./quantumSceneAdmission";

export type HydrogenStudyRequest = Readonly<{ reference: ProjectQuantumSceneReference;
  runId: string; resultSha256: string }>;

/** Reopen one exact complex orbital source before publishing its scene, field, Study and evidence. */
export async function admitVerifiedHydrogenStudy(base: Math3DProject, request: HydrogenStudyRequest,
  open: (reference: ProjectQuantumSceneReference) => Promise<QuantumSceneOpenResponse>): Promise<Math3DProject> {
  const opened = await open(request.reference);
  if (!opened.ok) throw new TypeError(opened.canceled ? "Hydrogen source opening was cancelled." : opened.error);
  const scene = quantumSceneDocumentFromVerifiedOpen(opened);
  const field = quantumFieldDocumentFromVerifiedOpen(opened);
  if (scene.source.provenance.model !== "hydrogenic" ||
      scene.source.provenance.runId !== request.runId ||
      scene.source.provenance.resultSha256 !== request.resultSha256 ||
      scene.source.sceneFingerprint !== request.reference.sceneFingerprint ||
      scene.location.directory !== request.reference.directory || field.source.field.kind !== "complex-field" ||
      field.source.scene.sceneFingerprint !== scene.source.sceneFingerprint)
    throw new TypeError("Hydrogen Study source differs from the declared complex orbital result.");
  const source = upsertMath3DProjectQuantumScene(base, request.reference);
  const entries = [...source.workspace.entries];
  for (const [module, checkpoint] of [["quantum", scene], ["field", field]] as const)
    if (!entries.some(item => item.expected.id === checkpoint.identity.id))
      entries.push({ module, checkpoint, expected: checkpoint.identity, replay: null });
  const quantumStudy = createQuantumStudyFromTemplate("hydrogen", scene, [scene]);
  const workspace = createMixedWorkspaceDocument({ ...source.workspace, entries,
    quantumStudies: [...(source.workspace.quantumStudies ?? []).filter(item => item.id !== quantumStudy.id), quantumStudy],
    activeDocumentIds: [...new Set([...source.workspace.activeDocumentIds, scene.identity.id, field.identity.id])] });
  let next = replaceMath3DProjectWorkspace(source, workspace);
  const title = `Hydrogen density and phase · ${request.runId}`;
  let study = next.workspace.studies?.find(item => item.title === title &&
    item.members.map(member => member.documentId).join(",") === [scene.identity.id, field.identity.id].join(","));
  if (!study) {
    next = createProjectStudyFromDocuments(next, ["hydrogen-complex-orbital", request.runId,
      request.resultSha256], title, [scene.identity.id, field.identity.id]);
    study = next.workspace.studies?.find(item => item.title === title);
  }
  if (!study) throw new TypeError("Hydrogen Project Study could not be created.");
  next = configureProjectStudy(next, study.id, { description:
    "How do the supplied complex amplitude, derived density |ψ|² and phase differ? Density is computed from the exact real and imaginary samples. Phase is undefined at nodes and its global offset is arbitrary.",
    mode: "split-2", paneIds: study.layout.panes.map(pane => pane.paneId) });
  for (const [kind, body] of [
    ["density", `Density is |ψ|² = real² + imaginary² from the verified ${field.source.field.real} and ${field.source.field.imaginary} datasets. The source amplitude unit is ${field.source.field.amplitudeUnit}; density has the squared unit. No new orbital solution is computed.`],
    ["phase", "Phase is atan2(imaginary, real) for nonzero amplitude. It is undefined at nodes and changes by a constant under an arbitrary global phase; density does not."],
  ] as const) {
    const note = createProjectNote({ projectId: next.identity.id,
      stableKey: ["hydrogen-study-evidence", quantumStudy.id, kind], kind: "text",
      title: `Hydrogen ${kind} source evidence`,
      body: `Run ${request.runId}; result SHA-256 ${request.resultSha256}; scene SHA-256 ${scene.source.sceneFingerprint}. ${body}`,
      anchor: pinProjectNoteAnchor(next, { kind: "document", source: viewerSourceFromDocument(field) }),
      createdAt: Date.now() });
    next = upsertMath3DProjectNote(next, note);
  }
  return next;
}
