/** CSV export for result browsers; callers choose provenance columns for their analysis. */
export function downloadGraph2DResultsCsv(filename: string, headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[]) {
  const quote = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.join(","), ...rows.map(row => row.map(quote).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = globalThis.document.createElement("a");
  link.href = url; link.download = filename;
  globalThis.document.body.appendChild(link); link.click(); link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
