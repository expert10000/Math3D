import { GRAPH2D_PUBLICATION_LIMITS, type Graph2DPublication } from "./graph2dPublication";
import type { Graph2DPublicationPrimitive } from "./graph2dPublicationGeometry";

// Original small encoder: W3C PNG, RFC1950 zlib and RFC1951 stored DEFLATE blocks.
// No Node/DOM/native encoder, fetched font, external image or new dependency is required.
const join = (parts: readonly Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
const uint32 = (value: number) => new Uint8Array([value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255]);
const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
const chunk = (kind: string, data: Uint8Array) => {
  const payload = join([new TextEncoder().encode(kind), data]); let crc = 0xffffffff;
  for (const byte of payload) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return join([uint32(data.length), payload, uint32((crc ^ 0xffffffff) >>> 0)]);
};
const zlibStored = (data: Uint8Array) => {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])]; let a = 1, b = 0;
  for (let offset = 0; offset < data.length; offset += 65535) {
    const length = Math.min(65535, data.length - offset), inverse = length ^ 65535;
    parts.push(new Uint8Array([offset + length === data.length ? 1 : 0, length & 255, length >>> 8, inverse & 255, inverse >>> 8]), data.subarray(offset, offset + length));
  }
  for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  parts.push(uint32((b << 16 | a) >>> 0)); return join(parts);
};
const glyphs: Record<string, string> = {
  "0": "111/101/101/101/111", "1": "010/110/010/010/111", "2": "111/001/111/100/111", "3": "111/001/111/001/111",
  "4": "101/101/111/001/001", "5": "111/100/111/001/111", "6": "111/100/111/101/111", "7": "111/001/010/010/010",
  "8": "111/101/111/101/111", "9": "111/101/111/001/111", "-": "000/000/111/000/000", "+": "000/010/111/010/000",
  ".": "000/000/000/000/010", "e": "000/111/101/110/111",
};

/** Deterministic bounded pixel raster. SVG remains the scalable/typographic publication format. */
export const renderGraph2DPublicationPNG = (publication: Graph2DPublication): Uint8Array => {
  const { width, height } = publication.metadata.size, pixels = new Uint8Array(width * height * 4); pixels.fill(255);
  let work = 0;
  const color = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const pixel = (x: number, y: number, rgb: readonly number[], opacity = 1) => {
    if (++work > 24000000) throw new TypeError("PNG raster work budget exceeded; use a smaller image or SVG.");
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = Math.round(pixels[index + channel] * (1 - opacity) + rgb[channel] * opacity);
  };
  const disc = (cx: number, cy: number, radius: number, rgb: readonly number[], open = false) => {
    const r2 = radius * radius, inner = Math.max(0, radius - 1.5) ** 2;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y++)
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x++) {
        const distance = (x - cx) ** 2 + (y - cy) ** 2;
        if (distance <= r2) pixel(x, y, open && distance < inner ? [255, 255, 255] : rgb);
      }
  };
  const line = (p: Extract<Graph2DPublicationPrimitive, { kind: "line" }>) => {
    const dx = p.x2 - p.x1, dy = p.y2 - p.y1, length = Math.hypot(dx, dy), steps = Math.max(1, Math.ceil(length * 1.5));
    const rgb = color(p.color), on = p.dash === "dotted" ? 2 : 8, period = p.dash === "dotted" ? 6 : 13;
    for (let i = 0; i <= steps; i++) {
      if (p.dash !== "solid" && (i / steps * length + p.dashOffset) % period >= on) continue;
      disc(p.x1 + dx * i / steps, p.y1 + dy * i / steps, Math.max(.75, p.width / 2), rgb);
    }
  };
  for (const p of publication.geometry.primitives) {
    if (p.kind === "line") line(p);
    else if (p.kind === "rect") { const rgb = color(p.color);
      for (let y = Math.max(0, Math.floor(p.y)); y < Math.min(height, Math.ceil(p.y + p.height)); y++)
        for (let x = Math.max(0, Math.floor(p.x)); x < Math.min(width, Math.ceil(p.x + p.width)); x++) pixel(x, y, rgb, p.opacity);
    } else if (p.kind === "circle") disc(p.x, p.y, p.radius, color(p.color), p.open);
    else {
      let left = Math.round(p.x); const top = Math.round(p.y - 10);
      for (const character of p.text) {
        const rows = (glyphs[character] ?? "000/000/000/000/000").split("/");
        rows.forEach((row, y) => [...row].forEach((value, x) => { if (value === "1") for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) pixel(left + x * 2 + sx, top + y * 2 + sy, [51, 65, 85]); }));
        left += 8;
      }
    }
  }
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) scanlines.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const metadata = new TextEncoder().encode(`Graph publication\0\0\0\0\0${JSON.stringify({ snapshotId: publication.snapshotId, ...publication.metadata })}`);
  const png = join([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", join([uint32(width), uint32(height), new Uint8Array([8, 6, 0, 0, 0])])),
    chunk("sRGB", new Uint8Array([0])), chunk("iTXt", metadata), chunk("IDAT", zlibStored(scanlines)), chunk("IEND", new Uint8Array())]);
  if (png.length > GRAPH2D_PUBLICATION_LIMITS.maxBytes) throw new TypeError("PNG exceeds the 8 MiB export limit.");
  return png;
};
