import { useCallback, useEffect, useRef, useState } from "react";
import { structuralHash, type Math3DProject, type ProjectComposition } from "@math3d/core";
import type { ProjectResourceReader } from "./projectResources";
import { createProjectComparisonEvidence, projectComparisonEvidenceHtml, type ComparisonEvidenceSelection } from "./projectComparisonEvidence";
import { downloadStudyBlob } from "./studyComparisonExport";

/** Captures only the already-mounted comparison panes. No second renderer or source copy. */
export function useComparisonEvidenceExport(project: Math3DProject, composition: ProjectComposition | null,
  readResource: ProjectResourceReader, selection: ComparisonEvidenceSelection | null) {
  const [captureToken, setCaptureToken] = useState(0), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef<{ images: (string | null)[]; resolve: (images: string[]) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => { if (pending.current) { clearTimeout(pending.current.timer); pending.current.reject(new TypeError("Comparison viewer closed during export.")); pending.current = null; } }, []);
  const onCapture = useCallback((slot: number) => (image: string | null) => {
    const request = pending.current;
    if (!request) return;
    if (!image || !/^data:image\/jpeg;base64,/.test(image)) { clearTimeout(request.timer); pending.current = null; request.reject(new TypeError("Comparison view capture is unavailable.")); return; }
    request.images[slot] = image;
    if (request.images.every(Boolean)) { clearTimeout(request.timer); pending.current = null; request.resolve(request.images as string[]); }
  }, []);
  const exportEvidence = useCallback(async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (!composition) throw new TypeError("Choose a saved comparison before exporting.");
      const before = createProjectComparisonEvidence(project, composition, readResource, selection);
      const count = composition.mode === "overlay" ? 1 : 2;
      const images = await new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(() => { pending.current = null; reject(new TypeError("Comparison view capture timed out.")); }, 8_000);
        pending.current = { images: Array(count).fill(null), resolve, reject, timer };
        setCaptureToken(value => value + 1);
      });
      const after = createProjectComparisonEvidence(project, composition, readResource, selection);
      if (structuralHash(before) !== structuralHash(after)) throw new TypeError("Comparison source changed during export.");
      const html = projectComparisonEvidenceHtml(after, images);
      downloadStudyBlob(new Blob([html], { type: "text/html" }), "math3d-project-comparison-evidence.html");
      setMessage("Checked comparison report downloaded with captured views.");
    } catch (error) { setMessage(`Comparison export refused: ${(error as Error).message}`); }
    finally { setBusy(false); }
  }, [busy, project, composition, readResource, selection]);
  return { captureToken, onCapture, exportEvidence, message, busy };
}
