import { useEffect, useState } from "react";
import { canonicalJsonStringify, type Math3DProject, type QuantumSceneDocument } from "@math3d/core";
import { quantumSceneDocumentFromVerifiedOpen } from "../projects/quantumSceneAdmission";
import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";
import { GeometryViewer } from "./GeometryViewer";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;

/** External scene bytes are independently reopened before this read-only pane receives geometry. */
export function StudyQuantumPanePreview({ project, document, role }: {
  project: Math3DProject; document: QuantumSceneDocument; role: "curvature" | "bands";
}) {
  const [state, setState] = useState<{ opened: Opened | null; error: string }>({ opened: null, error: "" });
  useEffect(() => {
    let active = true;
    setState({ opened: null, error: "" });
    const reference = project.quantumScenes?.find(item => item.sceneFingerprint === document.source.sceneFingerprint);
    if (!reference || reference.directory !== document.location.directory ||
        reference.format !== document.source.sceneSchema || !window.quantumScenes?.openReference) {
      setState({ opened: null, error: "Verified QWZ source reference is unavailable on this host." });
      return () => { active = false; };
    }
    void window.quantumScenes.openReference({ directory: reference.directory,
      sceneFingerprint: reference.sceneFingerprint }).then(result => {
      if (!active) return;
      if (!result.ok) throw new TypeError(result.canceled ? "QWZ source opening was cancelled." : result.error);
      const verified = quantumSceneDocumentFromVerifiedOpen(result);
      if (result.reference.sceneFingerprint !== reference.sceneFingerprint ||
          result.reference.directory !== reference.directory ||
          canonicalJsonStringify(verified.source) !== canonicalJsonStringify(document.source))
        throw new TypeError("QWZ source bytes or metadata changed since this Study was saved.");
      setState({ opened: result, error: "" });
    }).catch(error => { if (active) setState({ opened: null, error: String((error as Error).message) }); });
    return () => { active = false; };
  }, [project, document]);
  if (state.error) return <p role="status" data-testid="project-study-quantum-withheld">{state.error}</p>;
  if (!state.opened) return <p role="status">Verifying QWZ {role} source…</p>;
  return <div data-testid="project-study-quantum-view" data-role={role} style={{ position: "relative", height: "100%" }}>
    <small>Verified {role} · {document.source.sceneFingerprint.slice(0, 12)}</small>
    <div style={{ position: "relative", height: 290 }}><GeometryViewer scene={state.opened.document.geometry} /></div>
  </div>;
}
