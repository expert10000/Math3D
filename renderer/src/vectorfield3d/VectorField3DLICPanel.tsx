import { useEffect, useRef, useState } from "react";
import { computeVectorField3DLIC, type VectorField3DDocument,
  type VectorField3DLIC, type VectorField3DSliceArtifact } from "@math3d/core";

export function VectorField3DLICPanel({ document, slice }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<VectorField3DLIC | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { setResult(null); setMessage(""); }, [
    document.identity.structuralHash, slice?.source.structuralHash,
    slice?.fixedCoordinate, slice?.normalAxis]);
  useEffect(() => {
    if (!result || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    const image = context.createImageData(result.width, result.height);
    for (let index = 0; index < result.pixels.length; index++) {
      const value = Math.round(255 * result.pixels[index]!);
      image.data[index * 4] = value;
      image.data[index * 4 + 1] = value;
      image.data[index * 4 + 2] = value;
      image.data[index * 4 + 3] = result.mask[index] ? 255 : 0;
    }
    context.putImageData(image, 0, 0);
  }, [result]);
  const current = slice && slice.source.documentId === document.identity.id &&
    slice.source.revision === document.identity.revision &&
    slice.source.structuralHash === document.identity.structuralHash;
  const compute = () => { try {
    if (!slice || !current) throw new TypeError("Verify and preview the current slice first.");
    const next = computeVectorField3DLIC(slice, { width: 96, height: 96,
      steps: 8, noiseSeed: 73, maxWork: 200_000, timeBudgetMs: 300 });
    setResult(next); setMessage("");
  } catch (cause) { setResult(null); setMessage(String((cause as Error).message ?? cause)); } };
  return <section aria-label="Orthogonal slice LIC" data-testid="gf15-lic">
    <h5>Line integral convolution · CPU reference</h5>
    <button type="button" disabled={!current || !slice?.vectors} onClick={compute}>
      Compute bounded LIC preview</button>
    {result && <div role="status">
      <canvas ref={canvas} width={result.width} height={result.height}
        aria-label={`LIC preview, ${result.coveredPixels} of ${result.width * result.height} pixels covered`}
        style={{ width: 192, height: 192, background: "#334155", imageRendering: "pixelated" }} />
      <p>{result.state}; {result.coveredPixels}/{result.width * result.height} pixels;
        {" "}{result.elapsedMs.toFixed(1)} ms; {result.work} streamline steps;
        {" "}{result.stoppedAtBoundary} boundary stops; {result.stoppedAtMissing} missing-data stops;
        {" "}{result.stationaryPixels} stationary stops.</p>
    </div>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
