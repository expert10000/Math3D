import katex from "katex";
import { isWorkbookFigureImage, normalizeWorkbookDocumentContent, type WorkbookBlock } from "@math3d/workbook";

export const escapeNotebookHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export const renderNotebookMath = (value: string, displayMode = false, mathmlOnly = false): string => {
  if (!value.trim()) return "";
  try {
    if (value.length > 4096) throw new TypeError("Equation exceeds 4096 characters.");
    const html = katex.renderToString(value, { displayMode, output: mathmlOnly ? "mathml" : "htmlAndMathml", trust: false, strict: "error", throwOnError: true, maxExpand: 1000, maxSize: 16 });
    if (html.length > 512_000) throw new TypeError("Equation output exceeds its size limit.");
    return html;
  } catch { return `<code aria-label="Equation source (unsupported notation)">${escapeNotebookHtml(value.slice(0, 4096))}</code>`; }
};

const inline = (text: string, mathmlOnly: boolean) => {
  const tokens = /\*\*([^*\n]{1,2000})\*\*|\*([^*\n]{1,2000})\*|`([^`\n]{1,2000})`|\$([^$\n]{1,4096})\$|\[([^\]\n]{1,512})\]\(([^)\s]{1,2048})\)/g;
  let html = "", offset = 0;
  for (const match of text.matchAll(tokens)) {
    html += escapeNotebookHtml(text.slice(offset, match.index));
    if (match[1]) html += `<strong>${escapeNotebookHtml(match[1])}</strong>`;
    else if (match[2]) html += `<em>${escapeNotebookHtml(match[2])}</em>`;
    else if (match[3]) html += `<code>${escapeNotebookHtml(match[3])}</code>`;
    else if (match[4]) html += renderNotebookMath(match[4], false, mathmlOnly);
    else if (text[match.index! - 1] !== "!" && /^https?:\/\//i.test(match[6])) html += `<a href="${escapeNotebookHtml(match[6])}" target="_blank" rel="noopener noreferrer">${escapeNotebookHtml(match[5])}</a>`;
    else html += escapeNotebookHtml(match[0]);
    offset = match.index! + match[0].length;
  }
  return html + escapeNotebookHtml(text.slice(offset));
};

/** Deliberately bounded Markdown: HTML and image syntax remain literal content. */
export const renderNotebookMarkdown = (text: string, mathmlOnly = false) => {
  const lines = text.slice(0, 32_768).split(/\r?\n/), html: string[] = [];
  let code: string[] | null = null, list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) html.push(`</${list}>`); list = null; };
  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList(); if (code) { html.push(`<pre><code>${escapeNotebookHtml(code.join("\n"))}</code></pre>`); code = null; } else code = [];
      continue;
    }
    if (code) { code.push(line); continue; }
    const item = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if (item) { const kind = item[1] ? "ul" : "ol"; if (list !== kind) { closeList(); html.push(`<${kind}>`); list = kind; } html.push(`<li>${inline(item[2], mathmlOnly)}</li>`); continue; }
    closeList();
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) html.push(`<h${heading[1].length + 2}>${inline(heading[2], mathmlOnly)}</h${heading[1].length + 2}>`);
    else if (line.startsWith("> ")) html.push(`<blockquote>${inline(line.slice(2), mathmlOnly)}</blockquote>`);
    else if (line.trim()) html.push(`<p>${inline(line, mathmlOnly)}</p>`);
  }
  closeList(); if (code) html.push(`<pre><code>${escapeNotebookHtml(code.join("\n"))}</code></pre>`);
  return html.join("\n");
};

export const workbookDocumentContentHtml = (block: WorkbookBlock): string | null => {
  if (!block.documentContent) return null;
  let content;
  try { content = normalizeWorkbookDocumentContent(block.documentContent); } catch { return "<p>Document content is invalid.</p>"; }
  if (content.kind === "table") return `<div style="overflow-x:auto"><table><caption>${escapeNotebookHtml(content.caption)}</caption><thead><tr>${content.columns.map(column => `<th scope="col">${escapeNotebookHtml(column)}</th>`).join("")}</tr></thead><tbody>${content.rows.map(row => `<tr>${row.map(cell => `<td>${escapeNotebookHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const snapshot = block.visualize?.snapshotA ?? block.visualize?.snapshot;
  return `<figure>${isWorkbookFigureImage(snapshot?.thumbnail) ? `<img src="${snapshot.thumbnail}" alt="${escapeNotebookHtml(content.alt)}" style="max-width:100%;max-height:360px;object-fit:contain"/>` : "<p>Figure bytes unavailable. Capture a raster snapshot in Block view.</p>"}<figcaption>${escapeNotebookHtml(content.caption)}</figcaption></figure>`;
};
