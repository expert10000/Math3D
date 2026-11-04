import { useEffect, useRef, useState } from "react";
import { analyzeScientificComplexPlane, type ComplexPlaneAnalysis,
  type Graph2DFieldReference } from "@math3d/core";

/** Read-only analysis is cleared on every source, slice, or verification change. */
export function ScientificComplexPlaneAnalysisPanel({ manifestJson, fingerprint, reference,
  normalAxis, fixedIndex }: { manifestJson: string; fingerprint: string;
  reference: Graph2DFieldReference; normalAxis: 0 | 1 | 2; fixedIndex: number }) {
  const [analysis, setAnalysis] = useState<ComplexPlaneAnalysis | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"domain" | "density">("domain");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    setAnalysis(null); setError(""); setBusy(true);
    const bridge = window.scientificScenes;
    if (!bridge?.previewGraphPlane) { setError("The verified plane reader is unavailable."); setBusy(false); return; }
    void Promise.all(["real", "imaginary"].map(component => bridge.previewGraphPlane({
      fingerprint, datasetId: reference.datasetId, component, normalAxis, fixedIndex })))
      .then(([real, imaginary]) => {
        if (!active) return;
        const width = real!.shape[1], height = real!.shape[0];
        setAnalysis(analyzeScientificComplexPlane(manifestJson, fingerprint, real!, imaginary!,
          { left: 1, right: width - 2, top: 1, bottom: height - 2 }));
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [manifestJson, fingerprint, reference.datasetId, normalAxis, fixedIndex]);
  useEffect(() => {
    if (!analysis || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    const [width, height] = analysis.shape;
    const pixels = context.createImageData(width, height);
    if (mode === "domain") pixels.data.set(analysis.rgba);
    else {
      const finite = analysis.density.filter((value): value is number => value !== null);
      const scale = finite.sort((a, b) => a - b)[Math.floor(finite.length * .95)] ?? 1;
      analysis.density.forEach((value, index) => {
        const intensity = value === null ? 0 : Math.round(255 * Math.sqrt(value / (value + scale)));
        pixels.data.set([intensity, intensity, intensity, value === null ? 0 : 255], index * 4);
      });
    }
    context.putImageData(pixels, 0, 0);
  }, [analysis, mode]);
  const winding = analysis?.winding;
  return <section aria-label="Verified complex plane analysis" data-testid="gf19-complex-plane">
    <h4>Complex plane · |ψ|² and phase</h4>
    <p>Domain color encodes phase by hue and amplitude by brightness. Zero and undefined phase are transparent.
      This sampled field does not imply holomorphic behavior.</p>
    {busy && <p role="status">Verifying real and imaginary plane transfers…</p>}
    {error && <p role="alert">{error}</p>}
    {analysis && <>
      <div role="group" aria-label="Complex plane display">
        <button type="button" aria-pressed={mode === "domain"} onClick={() => setMode("domain")}>Domain color</button>
        <button type="button" aria-pressed={mode === "density"} onClick={() => setMode("density")}>|ψ|² density</button>
      </div>
      <canvas ref={canvas} width={analysis.shape[0]} height={analysis.shape[1]}
        style={{ maxWidth: 320, width: "100%", height: "auto", imageRendering: "pixelated" }}
        role="img" aria-label={`${mode === "domain" ? "Domain coloring" : "Density"} of ${analysis.definedCount} defined complex samples`} />
      <p role="status">|ψ|²: {analysis.definedCount} defined samples; {analysis.undefinedCount} undefined.
        Real plane {analysis.source.realPlaneSha256.slice(0, 12)}; imaginary plane
        {" "}{analysis.source.imaginaryPlaneSha256.slice(0, 12)}.</p>
      <p>Interior rectangular contour: {winding?.status === "resolved" ?
        `phase winding ${winding.integer} (coarse ${winding.coarseTurns?.toFixed(3)}, fine ${winding.fineTurns?.toFixed(3)} turns)` :
        `winding ${winding?.status}: ${winding?.reason}`}.
        {" "}Samples {winding?.coarseSamples} coarse / {winding?.fineSamples} fine.</p>
    </>}
  </section>;
}
