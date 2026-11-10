import type { ScientificSourceGeneration } from "@math3d/core";

type Props = Readonly<{
  current: boolean;
  resultId: string;
  source: ScientificSourceGeneration;
  claim: string;
  method: string;
  limitation: string;
  units: string;
}>;

/** Presentation of the recorded claim and its exact source, not a second scientific check. */
export function Graph2DResultEvidence({ current, resultId, source, claim, method, limitation, units }: Props) {
  return <div className="graph2d-result-evidence" data-testid="graph2d-result-evidence"
    data-qualification={current ? "current" : "historical"}>
    <p role="status"><strong>{current ? "Current numerical result" : "Historical numerical result"}</strong>
      {current ? ` · ${claim}` : " · source or settings changed; recorded values are withheld"}</p>
    <details><summary>Result evidence</summary><dl>
      <div><dt>Result</dt><dd><code>{resultId}</code></dd></div>
      <div><dt>Source</dt><dd><code>{source.documentId}</code> revision {source.revision}
        {" "}· <code>{source.structuralHash}</code></dd></div>
      <div><dt>Method</dt><dd>{method}</dd></div>
      <div><dt>Units</dt><dd>{units}</dd></div>
      <div><dt>Independent check</dt><dd>None recorded. {limitation}</dd></div>
    </dl></details>
  </div>;
}
