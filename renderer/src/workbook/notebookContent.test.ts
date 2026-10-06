import { expect, it } from "vitest";
import { isWorkbookFigureImage, normalizeWorkbookDocumentContent, workbookTableMarkdown, type WorkbookBlock } from "@math3d/workbook";
import { renderNotebookMarkdown, renderNotebookMath, workbookDocumentContentHtml } from "./notebookContent";

it("renders bounded Markdown and equations while treating active content as literal text", () => {
  const html = renderNotebookMarkdown('# Catenoid\n**Observation** and $H=0$\n- Negative curvature\n```\n<script>alert(1)</script>\n```\n<img src=x onerror=alert(1)>\n[x](javascript:alert)\n![remote](https://example.com/image.png)\n[reference](https://example.com)');
  expect(html).toContain("<h3>Catenoid</h3>"); expect(html).toContain("<strong>Observation</strong>"); expect(html).toContain('<math');
  expect(html).toContain('<li>Negative curvature</li>'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script');
  expect(html).not.toContain('<img'); expect(html).not.toContain('href="javascript:'); expect(html).toContain('![remote](https://example.com/image.png)');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(renderNotebookMath('\\frac{1}{a^2}')).toContain('class="katex"');
  expect(renderNotebookMath('\\htmlClass{bad}{x}')).not.toContain('class="bad"');
  expect(renderNotebookMath('\\href{javascript:alert(1)}{x}')).not.toContain('href="javascript:');
  expect(renderNotebookMath('\\notAnEquation')).toContain('unsupported notation');
  expect(renderNotebookMath('x'.repeat(4097))).toContain('unsupported notation');
  expect(renderNotebookMath('H=0', true, true)).toContain('display="block"');
});

it("renders literal table cells and accessible inline raster figures with enforced size limits", () => {
  const content = normalizeWorkbookDocumentContent({ schemaVersion: 1, kind: 'table', caption: 'Measurements', columns: ['Resolution', 'K'], rows: [['17', '<svg onload=alert(1)>'], ['33', '-1 | m^-2']] });
  const table = workbookDocumentContentHtml({ id: 'table', type: 'text', title: '', documentContent: content } as WorkbookBlock)!;
  expect(table).toContain('<caption>Measurements</caption>'); expect(table).toContain('scope="col"'); expect(table).toContain('&lt;svg'); expect(table).not.toContain('<svg');
  if (content.kind === 'table') expect(workbookTableMarkdown(content)).toContain('-1 \\| m^-2');
  expect(() => normalizeWorkbookDocumentContent({ ...content, rows: [['17']] })).toThrow(/match/);
  expect(() => normalizeWorkbookDocumentContent({ ...content, rows: Array.from({ length: 101 }, () => ['17', '0']) })).toThrow(/100/);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
  expect(isWorkbookFigureImage(png)).toBe(true); expect(isWorkbookFigureImage('data:image/png;base64,eA==')).toBe(false);
  expect(isWorkbookFigureImage('https://example.com/a.png')).toBe(false); expect(isWorkbookFigureImage('data:image/svg+xml;base64,eA==')).toBe(false);
  const figure = { id: 'figure', type: 'visualize', title: '', documentContent: { schemaVersion: 1, kind: 'figure', caption: 'Surface <view>', alt: 'Catenoid "profile"' }, visualize: { snapshotA: { thumbnail: png } } } as WorkbookBlock;
  expect(workbookDocumentContentHtml(figure)).toContain('alt="Catenoid &quot;profile&quot;"'); expect(workbookDocumentContentHtml(figure)).toContain('Surface &lt;view&gt;');
  expect(workbookDocumentContentHtml({ ...figure, visualize: {} })).toContain('Figure bytes unavailable');
});
