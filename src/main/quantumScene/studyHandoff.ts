import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { importQuantumSceneBundle } from "./importer";
import { sceneFingerprint } from "./recent";

const id = /^[A-Za-z0-9_-]{1,100}$/;
const hash = /^[a-f0-9]{64}$/;
export type QuantumStudyLaunch = { directory: string; mode: "new" | "attach" };

export function quantumStudyLaunchArguments(argv: readonly string[]): QuantumStudyLaunch | null {
  const flags = argv.flatMap((arg, index) => arg === "--quantum-study" ? [index] : []);
  if (!flags.length) return null;
  if (flags.length !== 1) throw new Error("Only one quantum study can be opened at launch");
  const directory = argv[flags[0] + 1], mode = argv[flags[0] + 2];
  if (!directory || !isAbsolute(directory) || resolve(directory) !== directory || directory.includes("\0") ||
      (mode !== "new" && mode !== "attach")) throw new Error("Invalid quantum study launch request");
  return { directory, mode };
}

export async function readQuantumStudyHandoff(directory: string) {
  if (!isAbsolute(directory) || resolve(directory) !== directory) throw new Error("Invalid study folder");
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Invalid study folder");
  const manifestPath = join(directory, "study.json");
  const info = await lstat(manifestPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384) throw new Error("Invalid study manifest");
  const raw: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid study manifest");
  const manifest = raw as Record<string, unknown>;
  if (Object.keys(manifest).sort().join(",") !== "model,resultSha256,runId,scenes,schema" ||
      !((manifest.schema === "quantum-study-handoff/v1" && manifest.model === "qwz") ||
        (manifest.schema === "quantum-study-handoff/v2" && manifest.model === "hofstadter")) ||
      typeof manifest.runId !== "string" || !id.test(manifest.runId) ||
      typeof manifest.resultSha256 !== "string" || !hash.test(manifest.resultSha256) ||
      !Array.isArray(manifest.scenes) || manifest.scenes.length !== 2)
    throw new Error("Invalid quantum study contract");
  const model = manifest.model as "qwz" | "hofstadter";
  const roles = model === "qwz" ? ["curvature", "bands"] : ["bands", "strip"];
  const scenes = manifest.scenes as unknown[];
  const rows = scenes.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid declared scene");
    const row = value as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== "folder,role,sceneId" ||
        row.role !== roles[index] ||
        typeof row.folder !== "string" || !/^[A-Za-z0-9_-]{1,100}\.qscene$/.test(row.folder) ||
        typeof row.sceneId !== "string" || !id.test(row.sceneId)) throw new Error("Invalid declared scene");
    return row as { folder: string; role: string; sceneId: string };
  });
  if (rows[0].folder === rows[1].folder || rows[0].sceneId === rows[1].sceneId)
    throw new Error("Study views must have distinct scene identities");
  const entries = (await readdir(directory)).sort();
  if (entries.join(",") !== ["study.json", ...rows.map(row => row.folder)].sort().join(","))
    throw new Error("Study folder inventory differs from its declaration");
  const references = [];
  for (const row of rows) {
    const sceneDirectory = join(directory, row.folder);
    const folder = await lstat(sceneDirectory);
    if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error("Invalid declared scene folder");
    const imported = await importQuantumSceneBundle(sceneDirectory);
    const scene = imported.source;
    if (scene.id !== row.sceneId || scene.provenance.runId !== manifest.runId ||
        scene.provenance.resultSha256 !== manifest.resultSha256 || scene.provenance.model !== model ||
        (model === "qwz" ? row.role === "bands" ? scene.bands?.kind !== "surface" :
          !scene.topology?.quantities.some(item => item.id === "lower-curvature") :
          row.role === "bands" ? !scene.bands : !scene.objects.some(item => item.id === "strip-left")))
      throw new Error("Declared study view does not match its independently verified scene");
    references.push({ format: scene.schema, title: scene.title, directory: sceneDirectory,
      sceneFingerprint: sceneFingerprint(imported) });
  }
  return { title: `${model === "qwz" ? "QWZ" : "Hofstadter"} study · ${manifest.runId}`, model,
    roles, runId: manifest.runId, resultSha256: manifest.resultSha256, references };
}
