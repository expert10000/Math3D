import { execFile } from "node:child_process";

// WSL does not load the user's interactive shell for --exec. Probe the paths used by
// Ubuntu packages and by SageMath's recommended Miniforge installation directly.
const FIND_SAGE = `for candidate in /usr/bin/sage /usr/local/bin/sage "$HOME/miniforge3/envs/sage/bin/sage" "$HOME/mambaforge/envs/sage/bin/sage" "$HOME/miniconda3/envs/sage/bin/sage"; do
  if test -x "$candidate"; then printf '%s\\n' "$candidate"; exit 0; fi
done
exit 1`;

export function localSageDistro(): string {
  const distro = process.env.MATH3D_WSL_DISTRO || "Ubuntu";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(distro)) {
    throw new Error("Invalid MATH3D_WSL_DISTRO name.");
  }
  return distro;
}

export function resolveLocalSageExecutable(): Promise<string> {
  const distro = localSageDistro();
  return new Promise((resolve, reject) => {
    execFile("wsl.exe", ["-d", distro, "--exec", "/bin/sh", "-c", FIND_SAGE],
      { windowsHide: true, timeout: 60_000, maxBuffer: 4096 }, (error, stdout, stderr) => {
        const executable = stdout.trim();
        if (!error && /^\/[A-Za-z0-9_./-]+$/.test(executable) && !executable.includes("..")) {
          resolve(executable);
        } else {
          const reason = error?.killed ? "WSL startup timed out." : /Wsl\/Service\/E_UNEXPECTED/.test(stderr) ? "WSL could not start." : "SageMath was not found.";
          reject(new Error(`${reason} Check WSL ${distro}, then install Sage in a conda environment named sage or through the distribution package manager.`));
        }
      });
  });
}
