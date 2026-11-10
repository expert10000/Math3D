import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type WorkerArtifactIdentity = {
  packaged: boolean;
  launchOrigin: "packaged-resource" | "override" | "source-script" | "unknown";
  artifactSha256: string | null;
  packageVersion: string | null;
};

const cache = new Map<string, Promise<string>>();

export async function identifyWorkerArtifact(args: {
  backend?: "python-script" | "bundled-exe";
  command?: string;
  packaged: boolean;
  resourcesPath: string;
  packageVersion: string | null;
}): Promise<WorkerArtifactIdentity> {
  if (args.backend !== "bundled-exe" || !args.command) return {
    packaged: args.packaged,
    launchOrigin: args.backend === "python-script" ? "source-script" : "unknown",
    artifactSha256: null,
    packageVersion: args.packageVersion,
  };
  const command = path.resolve(args.command);
  const normalize = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  let resolvedCommand = command;
  try { resolvedCommand = await fs.promises.realpath(command); } catch { /* Missing artifact is reported below. */ }
  const normalized = normalize(resolvedCommand);
  const packagedRoots = [
    path.join(args.resourcesPath, "python-worker"),
    path.join(args.resourcesPath, "app.asar.unpacked", "python-worker"),
  ].map((item) => normalize(path.resolve(item)));
  const expectedName = process.platform === "win32" ? "worker.exe" : "worker";
  const launchOrigin = args.packaged && normalize(path.basename(command)) === expectedName &&
    packagedRoots.some((root) => path.dirname(normalized) === root)
    ? "packaged-resource" : "override";
  let artifactSha256: string | null = null;
  try {
    const stat = await fs.promises.stat(command);
    if (stat.isFile()) {
      const key = `${command}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = (async () => {
          const hash = createHash("sha256");
          for await (const chunk of fs.createReadStream(command)) hash.update(chunk);
          return hash.digest("hex");
        })();
        cache.set(key, pending);
      }
      artifactSha256 = await pending;
    }
  } catch { /* A missing artifact is reported by worker startup. */ }
  return { packaged: args.packaged, launchOrigin, artifactSha256, packageVersion: args.packageVersion };
}
