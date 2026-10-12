#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (flag, fallback) => {
  const at = args.indexOf(flag);
  return at < 0 ? fallback : path.resolve(args[at + 1]);
};
const identity = JSON.parse(fs.readFileSync(option("--identity", path.join(root, "apps/mobile/version.json"))));
const info = JSON.parse(fs.readFileSync(option("--info", path.join(root, "artifacts/mobile/build-info.json"))));
const aab = option("--aab", path.join(root, "artifacts/mobile", `Math3D-mobile-${identity.version}-release.aab`));
const gradleFile = option("--gradle", path.join(root, "apps/mobile/android/build/reports/cyclonedx/bom.json"));
const out = option("--out", path.join(root, "artifacts/mobile", `Math3D-mobile-${identity.version}-release.cdx.json`));
const lock = JSON.parse(fs.readFileSync(option("--lock", path.join(root, "apps/mobile/package-lock.json"))));
const gradle = JSON.parse(fs.readFileSync(gradleFile));
if (info.channel !== "release" || info.version !== identity.version || info.build !== identity.build || !fs.existsSync(aab)) {
  throw new Error("Verified production AAB metadata is missing or mismatched.");
}
if (gradle.bomFormat !== "CycloneDX" || gradle.specVersion !== "1.6") {
  throw new Error("Native Gradle inventory must be CycloneDX 1.6.");
}
const hash = crypto.createHash("sha256").update(fs.readFileSync(aab)).digest("hex");
if (hash !== info.sha256) throw new Error("AAB changed after verification.");
const errors = [];
const components = [];
const dependencies = new Map();
const refs = new Set();
const add = (component, children = []) => {
  const ref = component["bom-ref"];
  if (!ref || refs.has(ref)) throw new Error(`Missing or duplicate BOM reference: ${ref}`);
  refs.add(ref);
  components.push(component);
  dependencies.set(ref, new Set(children));
  return ref;
};
const appRef = add({
  "bom-ref": "application:math3d-mobile", type: "application", name: "Math3D Mobile", version: identity.version,
  licenses: [{ expression: "GPL-3.0-or-later" }],
  hashes: [{ alg: "SHA-256", content: hash }],
  properties: [
    { name: "math3d:artifact", value: path.basename(aab) },
    { name: "math3d:sourceCommit", value: info.gitCommit },
    { name: "math3d:applicationId", value: info.applicationId },
  ],
});
add({
  "bom-ref": `file:${path.basename(aab)}`, type: "file", name: path.basename(aab),
  hashes: [{ alg: "SHA-256", content: hash }],
  properties: [{ name: "math3d:owner", value: appRef }],
});
dependencies.get(appRef).add(`file:${path.basename(aab)}`);

const gradleRefs = new Map();
// Expo's generated local Maven POMs omit licenses (and sometimes versions).
// Resolve only these known project components against their installed npm
// source packages. Any new gap still fails the release.
const localGradleSources = new Map([
  ["react-native-safe-area-context", "react-native-safe-area-context"],
  ["expo-constants", "expo-constants"],
  ["expo-modules-core", "expo-modules-core"],
  ["expo.modules.font", "expo-font"],
  ["expo", "expo"],
]);
for (const component of gradle.components ?? []) {
  const oldRef = component["bom-ref"];
  if (!oldRef) { errors.push(`Gradle component lacks bom-ref: ${component.name}`); continue; }
  const ref = `gradle:${oldRef}`;
  gradleRefs.set(oldRef, ref);
  const normalized = { ...component, "bom-ref": ref };
  if (!normalized.licenses?.length && component.name === "app" && oldRef.includes("project_path=%3Aapp")) {
    normalized.version = identity.version;
    normalized.licenses = [{ expression: "GPL-3.0-or-later" }];
    normalized.properties = [...(normalized.properties ?? []), { name: "math3d:licenseSource", value: "apps/mobile app source" }];
  } else if (!normalized.licenses?.length && localGradleSources.has(component.name)) {
    const npmName = localGradleSources.get(component.name);
    const mobilePackageFile = path.join(root, "apps/mobile/node_modules", npmName, "package.json");
    const packageFile = fs.existsSync(mobilePackageFile) ? mobilePackageFile : path.join(root, "node_modules", npmName, "package.json");
    if (!fs.existsSync(packageFile)) errors.push(`Local Gradle source package missing: ${npmName}`);
    else {
      const source = JSON.parse(fs.readFileSync(packageFile));
      if (source.name !== npmName || !source.version || !source.license ||
          (component.version !== "unspecified" && component.version !== source.version)) {
        errors.push(`Local Gradle source identity/license mismatch: ${component.name}@${component.version}`);
      } else {
        normalized.version = source.version;
        normalized.licenses = [{ expression: source.license }];
        normalized.properties = [...(normalized.properties ?? []),
          { name: "math3d:licenseSource", value: path.relative(root, packageFile).replaceAll("\\", "/") }];
      }
    }
  }
  if (!normalized.licenses?.length || normalized.licenses.some((item) => {
    const declared = item.expression || item.license?.id || item.license?.name || "";
    return !declared.trim() || /^(NOASSERTION|UNKNOWN)$/i.test(declared.trim());
  })) {
    errors.push(`Unknown Gradle license: ${component.name}@${component.version ?? "?"}`);
  }
  if (component.version === "unspecified" && normalized.version !== "unspecified" && normalized.purl) {
    normalized.purl = normalized.purl.replace("@unspecified", `@${normalized.version}`);
  }
  add(normalized);
  dependencies.get(appRef).add(ref);
}
for (const edge of gradle.dependencies ?? []) {
  const ref = gradleRefs.get(edge.ref);
  if (!ref) continue;
  for (const child of edge.dependsOn ?? []) {
    const target = gradleRefs.get(child);
    if (!target) errors.push(`Unresolved Gradle dependency: ${edge.ref} -> ${child}`);
    else dependencies.get(ref).add(target);
  }
}

const reviewed = new Map([["qrcode-terminal@0.11.0", "Apache-2.0"], ["requireg@0.2.2", "MIT"]]);
const npmRefs = new Map();
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  if (!key.startsWith("node_modules/") || entry.dev || (entry.os && !entry.os.includes("linux"))) continue;
  const name = key.slice(key.lastIndexOf("node_modules/") + 13);
  const local = path.join(root, "apps/mobile", key, "package.json");
  const installed = fs.existsSync(local) ? JSON.parse(fs.readFileSync(local)) : {};
  const linked = entry.link && entry.resolved ? path.resolve(root, "apps/mobile", entry.resolved, "package.json") : null;
  const linkedPackage = linked && fs.existsSync(linked) ? JSON.parse(fs.readFileSync(linked)) : {};
  const version = entry.version || installed.version || linkedPackage.version;
  if (entry.version && installed.version && entry.version !== installed.version && !entry.license) {
    errors.push(`Installed mobile npm version differs from lockfile: ${name} ${installed.version} != ${entry.version}`);
  }
  const declaredLicense = entry.license || installed.license || (name.startsWith("@math3d/") && entry.link ? "GPL-3.0-or-later" : null) || reviewed.get(`${name}@${version}`);
  if (!version || !declaredLicense || /^(UNKNOWN|NOASSERTION)$/i.test(declaredLicense)) {
    errors.push(`Unknown npm mobile identity/license: ${name}@${version ?? "?"}`);
    continue;
  }
  const ref = `npm:mobile:${key}`;
  npmRefs.set(key, ref);
  const component = {
    "bom-ref": ref, type: "library", name, version,
    purl: `pkg:npm/${name.startsWith("@") ? name.replace("@", "%40") : name}@${version}`,
    licenses: [{ expression: declaredLicense }],
    properties: [{ name: "math3d:lockfile", value: `apps/mobile/package-lock.json:${key}` }],
  };
  if (entry.resolved?.startsWith("https://")) component.externalReferences = [{ type: "distribution", url: entry.resolved }];
  if (entry.integrity?.startsWith("sha512-")) component.hashes = [{ alg: "SHA-512", content: Buffer.from(entry.integrity.slice(7), "base64").toString("hex") }];
  add(component);
  dependencies.get(appRef).add(ref);
}
const resolve = (parent, name) => {
  let cursor = parent;
  for (;;) {
    const candidate = `${cursor ? `${cursor}/` : ""}node_modules/${name}`;
    if (npmRefs.has(candidate)) return npmRefs.get(candidate);
    const slash = cursor.lastIndexOf("/");
    if (slash < 0) return null;
    cursor = cursor.slice(0, slash);
  }
};
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  const ref = npmRefs.get(key);
  if (!ref) continue;
  for (const name of Object.keys(entry.dependencies ?? {})) {
    const dependency = resolve(key, name);
    if (dependency) dependencies.get(ref).add(dependency);
  }
}
if (errors.length) {
  throw new Error(`Android SBOM has ${errors.length} unresolved item(s):\n${errors.slice(0, 80).join("\n")}`);
}
const bom = {
  $schema: "https://cyclonedx.org/schema/bom-1.6.schema.json",
  bomFormat: "CycloneDX", specVersion: "1.6", serialNumber: `urn:uuid:${crypto.randomUUID()}`, version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: { components: [{ type: "application", name: "Math3D Android release SBOM merger", version: "1" }] },
    component: { "bom-ref": appRef, type: "application", name: "Math3D Mobile", version: identity.version },
  },
  components: components.sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"])),
  dependencies: [...dependencies].sort(([a], [b]) => a.localeCompare(b)).map(([ref, children]) => ({ ref, dependsOn: [...children].sort() })),
};
fs.writeFileSync(out, `${JSON.stringify(bom, null, 2)}\n`);
const licenseCounts = new Map();
for (const component of components) {
  for (const entry of component.licenses ?? []) {
    const name = entry.expression || entry.license?.id || entry.license?.name;
    licenseCounts.set(name, (licenseCounts.get(name) ?? 0) + 1);
  }
}
const report = [
  `# Math3D Mobile ${identity.version} release inventory`, "",
  `AAB: ${path.basename(aab)}`, `SHA-256: ${hash}`,
  `Gradle components: ${gradleRefs.size}`, `npm components: ${npmRefs.size}`, "",
  "## Declared package licenses", "", "| License | Components |", "| --- | ---: |",
  ...[...licenseCounts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `| ${name.replaceAll("|", "\\|")} | ${count} |`), "",
  "The AAB digest binds this inventory to the signed artifact. Native dependencies are Gradle's resolved graph; JavaScript dependencies come from the mobile npm lockfile. Per-file AAB reconciliation is GPL-P04.", "",
].join("\n");
fs.writeFileSync(out.replace(/\.cdx\.json$/, "-licenses.md"), report);
console.log(`Generated ${path.basename(out)}: ${components.length} components.`);
