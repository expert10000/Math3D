export type WorkbookDocumentContent =
  | { schemaVersion: 1; kind: "table"; caption: string; columns: string[]; rows: string[][] }
  | { schemaVersion: 1; kind: "figure"; caption: string; alt: string };

export const normalizeWorkbookDocumentContent = (value: unknown): WorkbookDocumentContent => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid document content.");
  const item = value as Record<string, unknown>;
  const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
  const keys = item.kind === "table" ? ["schemaVersion", "kind", "caption", "columns", "rows"] : ["schemaVersion", "kind", "caption", "alt"];
  if (Object.keys(item).sort().join("|") !== keys.sort().join("|") || item.schemaVersion !== 1 || !text(item.caption, 512)) throw new TypeError("Invalid document content envelope.");
  if (item.kind === "table") {
    if (!Array.isArray(item.columns) || !item.columns.length || item.columns.length > 12 || item.columns.some(value => !text(value, 160) || !value.trim()) ||
        !Array.isArray(item.rows) || item.rows.length > 100 || item.rows.some(row => !Array.isArray(row) || row.length !== (item.columns as unknown[]).length || row.some(value => !text(value, 512))))
      throw new TypeError("Tables support 1–12 named columns, up to 100 rows and 512 characters per cell; every row must match the columns.");
  } else if (item.kind !== "figure" || !text(item.alt, 512) || !item.alt.trim()) throw new TypeError("Figures require an accessible description.");
  if (new TextEncoder().encode(JSON.stringify(item)).length > 128 * 1024) throw new TypeError("Document content exceeds 128 KiB.");
  return JSON.parse(JSON.stringify(item)) as WorkbookDocumentContent;
};

/** Inline raster bytes only; no external requests or active SVG content in document figures. */
export const isWorkbookFigureImage = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 3_000_000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const bytes = atob(value.slice(value.indexOf(",") + 1));
    if (value.startsWith("data:image/png;")) return bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes.charCodeAt(i) === value);
    return bytes.length >= 4 && bytes.charCodeAt(0) === 255 && bytes.charCodeAt(1) === 216 && bytes.charCodeAt(2) === 255;
  } catch { return false; }
};

export const workbookTableMarkdown = (content: Extract<WorkbookDocumentContent, { kind: "table" }>) => {
  const cell = (value: string) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  return [content.caption, `| ${content.columns.map(cell).join(" | ")} |`, `| ${content.columns.map(() => "---").join(" | ")} |`,
    ...content.rows.map(row => `| ${row.map(cell).join(" | ")} |`)].join("\n");
};
