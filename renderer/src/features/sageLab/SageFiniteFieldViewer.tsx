import { useState } from "react";
import type { SageFiniteFieldResult } from "@math3d/core";

type Tab = "Elements" | "Frobenius" | "Trace / norm" | "Minimal polynomial" | "Primitive elements" | "Multiplication table";
const tabs: readonly Tab[] = ["Elements", "Frobenius", "Trace / norm", "Minimal polynomial", "Primitive elements", "Multiplication table"];
const vector = (items: readonly number[]) => `[${items.join(", ")}]`;

export default function SageFiniteFieldViewer({ result }: { result: SageFiniteFieldResult }) {
  const [tab, setTab] = useState<Tab>("Elements");
  return <section data-testid="cas-finite-field-explorer" aria-label="Finite-field explorer"
    style={{ display: "grid", gap: 8, marginTop: 12 }}>
    <strong>GF({result.characteristic}^{result.degree}) · {result.order} elements</strong>
    <div>Generator {result.generator}; {result.definingPolynomial === null ? "prime field" :
      `defining polynomial coefficients ${vector(result.definingPolynomial)} (constant first)`}.</div>
    <small>The polynomial shown is the presentation used for this calculation. Another runtime may choose a different polynomial.</small>
    <div role="tablist" aria-label="Finite-field views" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item}
        onClick={() => setTab(item)}>{item}</button>)}
    </div>
    <div role="tabpanel" aria-label={tab} style={{ maxHeight: 280, overflow: "auto" }}>
      {tab === "Elements" && <div>Complete enumeration: {result.elements.map((item) =>
        `${vector(item.coefficients)} = ${item.text}`).join("; ")}</div>}
      {tab === "Frobenius" && <div>Selected {vector(result.selected.coefficients)} · orbit {result.selected.frobeniusOrbit
        .map(vector).join(" → ")}</div>}
      {tab === "Trace / norm" && <div>Selected {vector(result.selected.coefficients)}: trace {result.selected.trace};
        norm {result.selected.norm} (to GF({result.characteristic})).</div>}
      {tab === "Minimal polynomial" && <div>Selected {vector(result.selected.coefficients)}:
        coefficients {vector(result.selected.minimalPolynomial)} (constant first).</div>}
      {tab === "Primitive elements" && <div>Selected element order {result.selected.multiplicativeOrder ?? "undefined for zero"};
        primitive {result.selected.primitive ? "yes" : "no"}. All primitive elements: {result.primitiveElements
          .length ? result.primitiveElements.map(vector).join("; ") : "none"}.</div>}
      {tab === "Multiplication table" && (result.multiplicationTable.status === "complete"
        ? <div>Rows and columns follow the Elements enumeration. Cells give product indices.
          <table><caption>Exact multiplication in GF({result.characteristic}^{result.degree})</caption>
            <thead><tr><th scope="col">×</th>{result.elements.map((item, index) =>
              <th scope="col" key={index} title={item.text}>{index}</th>)}</tr></thead>
            <tbody>{result.multiplicationTable.cells.map((row, index) => <tr key={index}>
            <th scope="row">{vector(result.elements[index].coefficients)}</th>
            {row.map((cell, column) => <td key={column} title={vector(result.elements[cell].coefficients)}>{cell}</td>)}
          </tr>)}</tbody></table></div>
        : <div>{result.multiplicationTable.reason}</div>)}
    </div>
  </section>;
}
