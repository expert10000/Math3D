import { useEffect, useRef } from "react";
import { GRAPH2D_TOOLS, graph2DToolUnavailable, type Graph2DDocument, type Graph2DTool } from "@math3d/core";

// Original small line drawings, with visible names as the control authority.
const artwork = ["M3 8h18M8 3v18m-5-8 5-5 5 5M13 3l-5 5-5-5", "M12 3v18M3 12h18M9 9h6v6H9z",
  "M3 6h18M3 18h18M8 3v6M16 15v6", "M3 12h18M4 5l8 14 8-14", "M3 20Q12 0 21 20M9 5h6",
  "M3 3l18 18M3 21 21 3M9 9h6v6H9z", "M3 20Q10 0 21 10M3 16l18-8", "M3 19l18-14M5 14h1M10 16h1M14 7h1M19 9h1"];
export function Graph2DToolsPanel({ document, rowsAvailable, onTool, onClose }: {
  document: Graph2DDocument; rowsAvailable: boolean; onTool: (tool: Graph2DTool) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("[data-tool]")?.focus(); }, []);
  return <section ref={ref} className="graph2d-tools-panel" aria-label="Graph tools" data-testid="graph2d-tools" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
  }}>
    <header><h2>Tools</h2><button type="button" aria-label="Close graph tools" onClick={onClose}>Close</button></header>
    <div className="graph2d-tools-grid">{GRAPH2D_TOOLS.map((tool, i) => {
      const reason = graph2DToolUnavailable(document, tool.id, rowsAvailable);
      return <div key={tool.id}><button type="button" data-tool={tool.id} aria-label={tool.label} disabled={!!reason}
        title={reason ?? tool.hint} onClick={() => onTool(tool.id)}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d={artwork[i]} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>{tool.label}</button>
        <small>{reason ?? tool.hint}</small></div>;
    })}</div>
  </section>;
}
