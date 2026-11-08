import { canonicalJsonStringify, type Math3DProject, type QuantumSceneDocument } from "@math3d/core";
import type { QuantumSceneOpenResponse } from "../components/QuantumScenePreview";
import { quantumSceneDocumentFromVerifiedOpen } from "./quantumSceneAdmission";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;
type OpenReference = NonNullable<Window["quantumScenes"]>["openReference"];

/** The metadata checkpoint never substitutes for importer-verified external scene bytes. */
export async function openVerifiedStudyQuantumScene(project: Math3DProject, document: QuantumSceneDocument,
  open: OpenReference | undefined = typeof window === "undefined" ? undefined : window.quantumScenes?.openReference): Promise<Opened> {
  const reference = project.quantumScenes?.find(item => item.sceneFingerprint === document.source.sceneFingerprint);
  if (!reference || reference.directory !== document.location.directory ||
      reference.format !== document.source.sceneSchema || !open)
    throw new TypeError("Verified QWZ source reference is unavailable on this host.");
  const result = await open({ directory: reference.directory, sceneFingerprint: reference.sceneFingerprint });
  if (!result.ok) throw new TypeError(result.canceled ? "QWZ source opening was cancelled." : result.error);
  const verified = quantumSceneDocumentFromVerifiedOpen(result);
  if (result.reference.sceneFingerprint !== reference.sceneFingerprint ||
      result.reference.directory !== reference.directory ||
      canonicalJsonStringify(verified.source) !== canonicalJsonStringify(document.source))
    throw new TypeError("QWZ source bytes or metadata changed since this Study was saved.");
  return result;
}
