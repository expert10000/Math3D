#!/usr/bin/env node

// GPL-P03: create an artifact-bound CycloneDX inventory. P04 will compare
// installer containers with this unpacked tree; this step refuses unknown
// components rather than inventing a license or owner.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const at = args.indexOf(flag);
  if (at < 0) return fallback;
  if (!args[at + 1] || args[at + 1].startsWith("--")) throw new Error(`${flag} needs a value`);
  return args[at + 1];
};
const target = value("--target", process.platform === "win32" ? "windows" : "linux");
if (!["windows", "linux"].includes(target)) throw new Error(`Unsupported target ${target}`);
const appDir = path.resolve(value("--app-dir", target === "windows" ? "release/win-unpacked" : "release/linux-unpacked"));
const outDir = path.resolve(value("--out", "release-sbom"));
const pythonInventoryFile = value("--python-inventory", null);
const version = value("--version", JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version);
const errors = [];
const components = [];
const dependencies = new Map();
const refs = new Set();
const own = (ref, component, dependsOn = []) => {
  if (refs.has(ref)) throw new Error(`Duplicate BOM reference ${ref}`);
  refs.add(ref);
  components.push({ "bom-ref": ref, ...component });
  dependencies.set(ref, new Set(dependsOn));
  return ref;
};
const property = (name, value) => ({ name: `math3d:${name}`, value: String(value) });
const license = (expression) => /\(package-specific\)|^SEE LICENSE IN /i.test(expression)
  ? ({ license: { name: expression } })
  : ({ expression });
const digest = (filename) => {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filename, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally { fs.closeSync(fd); }
  return hash.digest("hex");
};
const normal = (value) => String(value).replaceAll("\\", "/");
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const sourceManifest = readJson(path.join(root, "compliance/public-source-manifest.json"));
const appRef = own("application:math3d", {
  type: "application", name: "Math3D", version,
  licenses: [license("GPL-3.0-or-later")],
  properties: [property("sourceCommit", spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim())],
});
const electronVersion = readJson(path.join(root, "node_modules/electron/package.json")).version;
const electronRef = own(`runtime:electron:${electronVersion}`, {
  type: "framework", name: "Electron", version: electronVersion,
  purl: `pkg:npm/electron@${electronVersion}`,
  licenses: [license("MIT")],
  externalReferences: [{ type: "website", url: "https://www.electronjs.org/" }],
  properties: [property("bundledNotices", "LICENSES.chromium.html")],
});
dependencies.get(appRef).add(electronRef);
const workerRef = own("application:math3d-python-worker", {
  type: "application", name: "Math3D frozen Python worker", version,
  licenses: [license("GPL-3.0-or-later")],
});
const webRef = own("application:math3d-web", {
  type: "application", name: "Math3D web bundle", version,
  licenses: [license("GPL-3.0-or-later")],
});
dependencies.get(appRef).add(workerRef);
dependencies.get(appRef).add(webRef);

// The lockfiles identify transitive JS dependencies; installed package.json
// supplies licenses absent from older npm lockfile entries. A small reviewed
// fallback covers published packages that omit the field even there.
const reviewedNpmLicenses = new Map([
  ["qrcode-terminal@0.11.0", "Apache-2.0"],
  ["requireg@0.2.2", "MIT"],
  ["webgl-constants@1.1.1", "MIT"],
]);
const npmRefs = new Map();
for (const [lockName, folder, parentRef] of [
  ["package-lock.json", root, appRef],
  ["renderer/package-lock.json", path.join(root, "renderer"), webRef],
]) {
  const lock = readJson(path.join(root, lockName));
  const entries = lock.packages ?? {};
  const prefix = lockName.startsWith("renderer/") ? "renderer" : "root";
  for (const [key, entry] of Object.entries(entries)) {
    if (!key.startsWith("node_modules/") || entry.dev) continue;
    if (entry.os && !entry.os.includes(target === "windows" ? "win32" : "linux")) continue;
    const packageFile = path.join(folder, key, "package.json");
    const installed = fs.existsSync(packageFile) ? readJson(packageFile) : {};
    const name = installed.name || key.slice(key.lastIndexOf("node_modules/") + 13);
    const packageVersion = entry.version || installed.version;
    if (!packageVersion || !name) { errors.push(`Missing npm identity: ${lockName}:${key}`); continue; }
    if (entry.version && installed.version && entry.version !== installed.version && !entry.license) {
      errors.push(`Installed npm version differs from lockfile: ${name} ${installed.version} != ${entry.version}`);
    }
    const declaredLicense = entry.license || installed.license ||
      (name.startsWith("@math3d/") && entry.link ? "GPL-3.0-or-later" : null) ||
      reviewedNpmLicenses.get(`${name}@${packageVersion}`);
    if (!declaredLicense || /^(unknown|noassertion|unlicensed)$/i.test(declaredLicense)) {
      errors.push(`Unknown npm license: ${name}@${packageVersion} (${lockName}:${key})`);
      continue;
    }
    const ref = `npm:${prefix}:${key}`;
    npmRefs.set(`${prefix}:${key}`, ref);
    const component = {
      type: "library", name, version: packageVersion,
      purl: `pkg:npm/${name.startsWith("@") ? name.replace("@", "%40") : name}@${packageVersion}`,
      licenses: [license(declaredLicense)],
      properties: [property("lockfile", `${lockName}:${key}`)],
    };
    if (entry.resolved?.startsWith("https://")) component.externalReferences = [{ type: "distribution", url: entry.resolved }];
    if (entry.integrity?.startsWith("sha512-")) component.hashes = [{ alg: "SHA-512", content: Buffer.from(entry.integrity.slice(7), "base64").toString("hex") }];
    own(ref, component);
    dependencies.get(parentRef).add(ref);
  }
  // Resolve Node's nearest-node_modules rule against lockfile package paths.
  const resolve = (parent, name) => {
    let cursor = parent;
    for (;;) {
      const candidate = `${cursor ? `${cursor}/` : ""}node_modules/${name}`;
      if (npmRefs.has(`${prefix}:${candidate}`)) return npmRefs.get(`${prefix}:${candidate}`);
      const slash = cursor.lastIndexOf("/");
      if (slash < 0) return null;
      cursor = cursor.slice(0, slash);
    }
  };
  for (const [key, entry] of Object.entries(entries)) {
    const ref = npmRefs.get(`${prefix}:${key}`);
    if (!ref) continue;
    for (const name of Object.keys(entry.dependencies ?? {})) {
      const dependency = resolve(key, name);
      if (dependency) dependencies.get(ref).add(dependency);
    }
  }
}

const pythonInventory = (() => {
  if (pythonInventoryFile) return readJson(path.resolve(pythonInventoryFile));
  const python = process.env.MATH3D_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, [path.join(root, "scripts/release-python-sbom-inventory.py")], {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Python dependency inventory failed: ${result.stderr || result.stdout || result.error}`);
  return JSON.parse(result.stdout);
})();
const pythonLicense = (pkg) => {
  if (pkg.name.toLowerCase() === "python-dateutil") return "Apache-2.0 OR BSD-3-Clause";
  const expression = pkg.licenseExpression?.trim();
  if (expression) return expression;
  const raw = pkg.license?.trim() ?? "";
  if (/^(MIT|BSD-2-Clause|BSD-3-Clause|GPL-3\.0-or-later|Apache-2\.0|MIT-CMU)$/.test(raw)) return raw;
  const classifiers = pkg.classifiers ?? [];
  const has = (part) => classifiers.some((entry) => entry.includes(part));
  if (has("GNU General Public License v3 or later")) return "GPL-3.0-or-later";
  if (has("MIT License")) return "MIT";
  if (has("BSD License")) return "BSD-3-Clause";
  if (has("Python Software Foundation License")) return "PSF-2.0";
  if (has("Apache Software License")) return "Apache-2.0";
  if (/^BSD 3-Clause License/.test(raw)) return "BSD-3-Clause";
  if (/^The MIT License/.test(raw)) return "MIT";
  return null;
};
const pythonRefs = new Map();
const pythonRuntimeRef = own(`runtime:python:${pythonInventory.pythonVersion}`, {
  type: "framework", name: "CPython", version: pythonInventory.pythonVersion,
  licenses: [license("Python-2.0")],
});
dependencies.get(workerRef).add(pythonRuntimeRef);
for (const pkg of pythonInventory.packages) {
  const name = pkg.name.toLowerCase().replaceAll("_", "-");
  const expression = pythonLicense(pkg);
  if (!expression) { errors.push(`Unknown Python license: ${pkg.name}@${pkg.version}`); continue; }
  const ref = `python:${name}:${pkg.version}`;
  pythonRefs.set(name, ref);
  const component = {
    type: "library", name: pkg.name, version: pkg.version,
    purl: `pkg:pypi/${name}@${pkg.version}`,
    licenses: [license(expression)],
    properties: [property("inventory", "resolved frozen-worker dependency")],
  };
  if (pkg.homePage?.startsWith("https://")) component.externalReferences = [{ type: "website", url: pkg.homePage }];
  own(ref, component);
  dependencies.get(workerRef).add(ref);
}
for (const pkg of pythonInventory.packages) {
  const ref = pythonRefs.get(pkg.name.toLowerCase().replaceAll("_", "-"));
  if (!ref) continue;
  for (const name of pkg.dependencies ?? []) {
    const dependency = pythonRefs.get(name);
    if (!dependency) errors.push(`Unresolved Python dependency: ${pkg.name} -> ${name}`);
    else dependencies.get(ref).add(dependency);
  }
}

for (const entry of sourceManifest.sources.filter((source) => source.targets.includes(target))) {
  const ref = `source:${entry.filename}`;
  own(ref, {
    type: "file", name: entry.filename, version: entry.version,
    hashes: [{ alg: "SHA-256", content: entry.sha256 }],
    licenses: [license(entry.license)],
    externalReferences: [{ type: "distribution", url: entry.url }],
    properties: [property("correspondingSource", target)],
  });
  dependencies.get(workerRef).add(ref);
}
const nativeRefs = new Map();
for (const name of ["GMP", "MPFR"]) {
  const source = sourceManifest.sources.find((entry) => entry.name === name && entry.targets.includes(target));
  if (!source) { errors.push(`Missing native source identity: ${name} for ${target}`); continue; }
  const ref = `native:${name.toLowerCase()}:${source.version}`;
  nativeRefs.set(name, ref);
  own(ref, {
    type: "library", name, version: source.version,
    licenses: [license(source.license)],
    properties: [property("sourceArchive", source.filename)],
  }, [`source:${source.filename}`]);
  dependencies.get(workerRef).add(ref);
}

if (!fs.existsSync(appDir)) errors.push(`Unpacked release directory missing: ${appDir}`);
const required = ["resources/app.asar", "resources/python-worker", "resources/web-app", "resources/LICENSE", "resources/THIRD_PARTY_NOTICES.md"];
for (const item of required) if (!fs.existsSync(path.join(appDir, item))) errors.push(`Packaged release item missing: ${item}`);
const files = [];
const symlinks = new Map();
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const resolved = fs.realpathSync(absolute);
      if (resolved !== appDir && !resolved.startsWith(`${appDir}${path.sep}`)) {
        errors.push(`Packaged symlink escapes release root: ${absolute} -> ${resolved}`);
        continue;
      }
      symlinks.set(absolute, normal(fs.readlinkSync(absolute)));
      files.push(absolute);
      continue;
    }
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) files.push(absolute);
    else errors.push(`Unsupported packaged entry: ${absolute}`);
  }
};
if (fs.existsSync(appDir)) walk(appDir);
const executable = (name, absolute) => /\.(exe|dll|so(?:\.\d+)*|dylib|node|pyd|wasm)$/i.test(name) ||
  /(^|\/)python-worker\/worker$/.test(name) ||
  (target === "linux" && (fs.statSync(absolute).mode & 0o111) !== 0);
const classify = (name) => {
  if (name.startsWith("resources/python-worker/")) {
    const inside = name.slice("resources/python-worker/".length).toLowerCase();
    const leaf = path.posix.basename(inside);
    if (/^(?:lib|msys-)?gmp(?:-|\.|$)/.test(leaf)) return nativeRefs.get("GMP") ?? null;
    if (/^(?:lib|msys-)?mpfr(?:-|\.|$)/.test(leaf)) return nativeRefs.get("MPFR") ?? null;
    if (inside.includes("/cgal/") || inside.startsWith("cgal/")) return pythonRefs.get("cgal") ?? workerRef;
    if (leaf.startsWith("_pygalmesh.")) return pythonRefs.get("pygalmesh") ?? workerRef;
    for (const packageName of ["vtk", "numpy", "scipy"]) {
      if (inside.includes(`/${packageName}.libs/`) || inside.includes(`/${packageName}/`)) return pythonRefs.get(packageName) ?? workerRef;
    }
    if (/^python3\d+(?:t)?\.(?:dll|so(?:\.\d+)*)$/.test(leaf) || leaf === "base_library.zip") return pythonRuntimeRef;
    return workerRef;
  }
  if (name.startsWith("resources/web-app/")) return webRef;
  if (name.startsWith("resources/app.asar.unpacked/node_modules/")) {
    const suffix = name.slice("resources/app.asar.unpacked/".length);
    const markers = [...suffix.matchAll(/node_modules\/(?:@[^/]+\/)?[^/]+/g)].map((match) => match.index + match[0].length);
    for (const end of markers.reverse()) {
      const ref = npmRefs.get(`root:${suffix.slice(0, end)}`);
      if (ref) return ref;
    }
    errors.push(`Native module has no npm lockfile owner: ${name}`);
    return null;
  }
  if (name === "resources/app.asar" || name.startsWith("resources/app.asar.unpacked/") || name.startsWith("resources/quantum-scenes/") || name.startsWith("resources/scientific-scenes/") || name.startsWith("resources/scientific-publisher/") || name.startsWith("resources/LICENSE") || name.startsWith("resources/gallery-images/") || ["resources/THIRD_PARTY_NOTICES.md", "resources/SOURCE_OFFER.md"].includes(name)) return appRef;
  if (name === "resources/electron.asar") return electronRef;
  // electron-builder places its Windows elevation helper beside the app archive.
  if (name === "resources/app-update.yml" || name === "resources/elevate.exe") return appRef;
  if (/^(?:Math3D(?: Dev)?\.exe|math3d(?:-dev)?)$/i.test(name)) return appRef;
  if (/^(?:chrome(?:_100_percent|_200_percent)?\.pak|chrome-sandbox|chrome_crashpad_handler(?:\.exe)?|d3dcompiler_47\.dll|dxcompiler\.dll|dxil\.dll|ffmpeg\.dll|icudtl\.dat|libEGL\.(?:dll|so)|libGLESv2\.(?:dll|so)|libffmpeg\.so|libvulkan\.so\.1|libvk_swiftshader\.so|resources\.pak|snapshot_blob\.bin|v8_context_snapshot\.bin|vk_swiftshader\.dll|vk_swiftshader_icd\.json|vulkan-1\.dll|LICENSE\.electron\.txt|LICENSES\.chromium\.html|version)$/i.test(name)) return electronRef;
  if (/^locales\/[A-Za-z0-9_-]+\.pak$/.test(name)) return electronRef;
  if (/^swiftshader\/(?:libEGL|libGLESv2)\.(?:dll|so)$/.test(name)) return electronRef;
  return null;
};
for (const absolute of files.sort()) {
  const name = normal(path.relative(appDir, absolute));
  const owner = classify(name);
  if (!owner) { errors.push(`Unowned packaged file: ${name}`); continue; }
  const ref = `file:${name}`;
  own(ref, {
    type: "file", name,
    hashes: [{ alg: "SHA-256", content: symlinks.has(absolute)
      ? crypto.createHash("sha256").update(symlinks.get(absolute)).digest("hex")
      : digest(absolute) }],
    properties: [property("packagedPath", name), property("owner", owner), property("executable", executable(name, absolute)),
      ...(symlinks.has(absolute) ? [property("symlinkTarget", symlinks.get(absolute))] : [])],
  });
  dependencies.get(owner).add(ref);
}

if (errors.length) {
  console.error(`SBOM generation failed with ${errors.length} unresolved item(s):`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
  if (errors.length > 100) console.error(`- ... ${errors.length - 100} more`);
  process.exit(1);
}
const bom = {
  $schema: "https://cyclonedx.org/schema/bom-1.6.schema.json",
  bomFormat: "CycloneDX", specVersion: "1.6", serialNumber: `urn:uuid:${crypto.randomUUID()}`, version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: { components: [{ type: "application", name: "Math3D release SBOM generator", version: "1" }] },
    component: { "bom-ref": appRef, type: "application", name: "Math3D", version },
    properties: [property("target", target), property("unpackedRoot", path.basename(appDir))],
  },
  components: components.sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"])),
  dependencies: [...dependencies].sort(([a], [b]) => a.localeCompare(b)).map(([ref, children]) => ({ ref, dependsOn: [...children].sort() })),
};
fs.mkdirSync(outDir, { recursive: true });
const base = `Math3D-${version}-${target}`;
fs.writeFileSync(path.join(outDir, `${base}.cdx.json`), `${JSON.stringify(bom, null, 2)}\n`);
const counts = { files: files.length, npm: [...npmRefs].length, python: pythonRefs.size, sources: sourceManifest.sources.filter((source) => source.targets.includes(target)).length };
const licenseCounts = new Map();
for (const component of components) {
  if (component.type === "file" || !component.licenses) continue;
  for (const entry of component.licenses) {
    const key = entry.expression ?? entry.license?.name;
    licenseCounts.set(key, (licenseCounts.get(key) ?? 0) + 1);
  }
}
const report = [
  `# Math3D ${version} ${target} release inventory`, "",
  `Unpacked root: ${appDir}`, `SHA-256 file entries: ${counts.files}`,
  `npm lockfile components: ${counts.npm}`, `Python runtime components: ${counts.python}`,
  `Corresponding source archives: ${counts.sources}`, "",
  "## Declared package licenses", "",
  "| License | Components |", "| --- | ---: |",
  ...[...licenseCounts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `| ${name.replaceAll("|", "\\|")} | ${count} |`), "",
  "Each unpacked file has a SHA-256 hash and an owner. A symlink hash covers its link target text. Package licenses come from installed metadata or reviewed published-license fallbacks in the generator. Installer container reconciliation is GPL-P04.", "",
].join("\n");
fs.writeFileSync(path.join(outDir, `${base}-licenses.md`), report);
console.log(`Generated ${base}.cdx.json: ${JSON.stringify(counts)}`);
