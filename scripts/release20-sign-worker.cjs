"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, mkdtempSync, readdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

function locateSignTool() {
  const kits = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  if (existsSync(kits)) {
    for (const version of readdirSync(kits).sort().reverse()) {
      const exe = join(kits, version, "x64", "signtool.exe");
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error("Windows SDK x64 signtool.exe is required for the 2.0 release worker.");
}

module.exports = async function signRelease20Worker(context) {
  if (process.platform !== "win32" || require("../package.json").version !== "2.0.0") return;
  const encoded = process.env.CSC_LINK || "";
  const password = process.env.CSC_KEY_PASSWORD || "";
  const timestamp = process.env.MATH3D_WINDOWS_TIMESTAMP_URL || "";
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) || !encoded || !password ||
      !/^https?:\/\/[^\s]+$/.test(timestamp)) {
    throw new Error("2.0 worker signing requires base64 CSC_LINK, CSC_KEY_PASSWORD, and a timestamp URL.");
  }
  const worker = join(context.appOutDir, "resources", "python-worker", "worker.exe");
  if (!existsSync(worker)) throw new Error(`Frozen worker missing before signing: ${worker}`);
  const native = join(context.appOutDir, "resources", "native-cgal", "math3d-cgal-worker.exe");
  if (process.env.MATH3D_BUNDLE_NATIVE_CGAL === "1" && !existsSync(native))
    throw new Error(`Optional native CGAL worker missing before signing: ${native}`);
  const scratch = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "math3d-release20-sign-"));
  try {
    const certificate = join(scratch, "certificate.pfx");
    writeFileSync(certificate, Buffer.from(encoded, "base64"), { mode: 0o600 });
    for (const executable of [worker, ...(existsSync(native) ? [native] : [])])
      execFileSync(locateSignTool(), ["sign", "/fd", "SHA256", "/tr", timestamp, "/td", "SHA256",
        "/f", certificate, "/p", password, executable], { stdio: "pipe" });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};
