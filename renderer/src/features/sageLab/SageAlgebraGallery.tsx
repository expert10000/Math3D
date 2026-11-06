import { useState } from "react";
import { ALGEBRA_GALLERY_EXAMPLES, type AlgebraGalleryId, type AlgebraObjectRef, type Math3DProject } from "@math3d/core";

type Props = { project: Math3DProject | null;
  onInstall: (id: AlgebraGalleryId) => AlgebraObjectRef | Promise<AlgebraObjectRef>;
  onSelect: (ref: AlgebraObjectRef) => void };
export default function SageAlgebraGallery({ project, onInstall, onSelect }: Props) {
  const [busy, setBusy] = useState<AlgebraGalleryId | null>(null);
  const [message, setMessage] = useState("");
  return <details data-testid="cas-algebra-gallery" style={{ marginTop: 8, fontSize: 12 }}>
    <summary>Curated algebra examples</summary>
    <p>Each example saves exact parent objects and a primary structure together in this Project.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 8 }}>
      {ALGEBRA_GALLERY_EXAMPLES.map((example) => <article key={example.id} data-testid={`cas-gallery-${example.id}`}
        style={{ border: "1px solid #dbe2ea", borderRadius: 8, padding: 9 }}>
        <strong>{example.title}</strong> · {example.category}
        <p>{example.explanation}</p>
        <div>Exact expected answers:</div>
        <ul>{example.expected.map((item) => <li key={item}>{item}</li>)}</ul>
        <div><strong>Failure example:</strong> {example.failure}</div>
        <button type="button" disabled={!project || !!busy} onClick={async () => {
          setBusy(example.id); setMessage("");
          try { const ref = await onInstall(example.id); onSelect(ref);
            setMessage(`Saved ${example.title} in Project.`); }
          catch (error) { setMessage(String((error as Error).message ?? error)); }
          finally { setBusy(null); }
        }}>Save example</button>
      </article>)}
    </div>
    {message && <div role="status" data-testid="cas-gallery-status">{message}</div>}
  </details>;
}
