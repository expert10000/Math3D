/** Export a source-linked analysis result without changing the workspace document. */
export function downloadGraph2DResultJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)],
    { type: "application/json;charset=utf-8" }));
  const link = globalThis.document.createElement("a");
  link.href = url; link.download = filename;
  globalThis.document.body.appendChild(link); link.click(); link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
