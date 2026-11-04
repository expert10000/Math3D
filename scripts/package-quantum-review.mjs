import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "output/quantum-review-package");
const labRevision = process.argv[3] ?? "unknown";
const mathRevision = process.argv[4] ?? "unknown";
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const groups = [];
for (const [directory, title] of [["Theory-Lab", "Quantum Hamiltonian Lab"], ["Math3D", "Math3D quantum scenes"]]) {
  const files = (await readdir(join(root, directory))).filter(name => name.endsWith(".png")).sort();
  if (files.length < 30) throw new Error(`${title}: only ${files.length} PNG screenshots.`);
  const items = [];
  for (const file of files) {
    const bytes = await readFile(join(root, directory, file));
    items.push({ file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  groups.push({ directory, title, revision: directory === "Theory-Lab" ? labRevision : mathRevision, items });
}
const capturedAt = new Date().toISOString();
const manifest = { format: "quantum-math3d-review/v1", capturedAt, groups };
await writeFile(join(root, "review-manifest.json"), JSON.stringify(manifest, null, 2));
const sections = groups.map(group => `<section id="${group.directory}"><h2>${escape(group.title)} · ${group.items.length} screenshots</h2>
<p>Source commit <code>${escape(group.revision)}</code></p><div class="grid">${group.items.map(item =>
  `<a class="card" href="${group.directory}/${encodeURIComponent(item.file)}" target="_blank"><img loading="lazy" src="${group.directory}/${encodeURIComponent(item.file)}" alt="${escape(item.file)}"><span>${escape(item.file)}</span></a>`).join("\n")}</div></section>`).join("\n");
await writeFile(join(root, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quantum Hamiltonian Lab + Math3D review</title><style>body{font:16px system-ui,sans-serif;background:#101923;color:#e5f2f1;margin:0;padding:2rem;line-height:1.5}a{color:#82dac6}nav{display:flex;gap:1.5rem}section{margin:3rem 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}.card{display:block;background:#1c2935;padding:.7rem;border-radius:10px;text-decoration:none;color:inherit;min-width:0}.card img{width:100%;aspect-ratio:16/10;object-fit:contain;background:#0d1219}.card span{display:block;overflow-wrap:anywhere;margin-top:.4rem;font-size:.9rem}</style>
<h1>Quantum Hamiltonian Lab + Math3D review</h1><p>${groups.map(group => `${group.items.length} ${escape(group.title)}`).join(" · ")}. Captured ${escape(capturedAt)}.</p>
<nav><a href="#Theory-Lab">Theory Lab</a><a href="#Math3D">Math3D</a><a href="scene-review-matrix.md">Scene and source matrix</a><a href="roundtrip-evidence.json">Round-trip evidence</a></nav><p>These are direct desktop screenshots. Math3D displays pinned, verified Theory Lab scene bundles read-only. Image SHA-256 values are in <a href="review-manifest.json">review-manifest.json</a>. The scene matrix distinguishes bundles with archived producer result bytes from scene-only fixtures.</p>${sections}</html>`);
await writeFile(join(root, "README.md"), `# Quantum Hamiltonian Lab and Math3D visual review\n\nCaptured: ${capturedAt}\n\n- Theory Lab: ${groups[0].items.length} direct Electron screenshots from its completed desktop smoke run, source ${labRevision}.\n- Math3D: ${groups[1].items.length} direct Electron screenshots of 36 pinned quantum scenes and 10 orbital view variants, source ${mathRevision}.\n\nOpen \`index.html\` for a gallery, or inspect the PNG folders directly. \`scene-review-matrix.md\` maps every pinned scene to its Lab model, claimed saved run, result hash, units, Math3D view and screenshot. \`roundtrip-evidence.json\` records three fresh Lab producer → Math3D import checks. \`review-manifest.json\` records each image's SHA-256. Theory Lab screenshots show computation and run workflows; Math3D screenshots show verified read-only scene consumption. Local paths and run IDs visible in the UI are part of the captured application state.\n`);
console.log(`${groups[0].items.length} Theory Lab and ${groups[1].items.length} Math3D screenshots indexed.`);
