#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isWindowsStorePythonAlias(candidate) {
  if (process.platform !== "win32") return false;
  const normalized = path.normalize(candidate).toLowerCase();
  return (
    normalized.endsWith(path.normalize("\\Microsoft\\WindowsApps\\python.exe").toLowerCase()) ||
    normalized.endsWith(path.normalize("\\Microsoft\\WindowsApps\\python3.exe").toLowerCase())
  );
}

function findExecutablesOnPath(names) {
  const entries = String(process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const candidates = [];
  const seen = new Set();
  for (const dir of entries) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      const key = process.platform === "win32" ? candidate.toLowerCase() : candidate;
      if (fs.existsSync(candidate) && !seen.has(key)) {
        seen.add(key);
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function resolvePythonCommand() {
  const fromEnv = String(process.env.MATH3D_PYTHON || "").trim();
  if (fromEnv) return { command: fromEnv, args: [] };

  const venvPython = path.join(
    repoRoot,
    ".venv-worker",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
  );
  if (fs.existsSync(venvPython)) return { command: venvPython, args: [] };

  if (process.platform === "win32") {
    const pythonCandidates = findExecutablesOnPath(["python.exe", "python3.exe"]);
    const python = pythonCandidates.find((candidate) => !isWindowsStorePythonAlias(candidate));
    if (python) return { command: python, args: [] };

    const pyLauncher = findExecutablesOnPath(["py.exe"])[0];
    if (pyLauncher) return { command: pyLauncher, args: ["-3"] };

    const ignoredAliases = pythonCandidates.filter(isWindowsStorePythonAlias);
    const ignored = ignoredAliases.length ? ` Ignored Windows Store alias: ${ignoredAliases.join(", ")}.` : "";
    throw new Error(
      [
        "No usable Python interpreter found for the worker build.",
        "Install Python 3.11+, set MATH3D_PYTHON to a real python.exe, or create .venv-worker.",
        ignored,
      ].join(" ")
    );
  }

  return { command: "python3", args: [] };
}

const python = resolvePythonCommand();
const result = spawnSync(python.command, [...python.args, "python/worker/freeze.py"], {
  cwd: repoRoot,
  env: { ...process.env },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
