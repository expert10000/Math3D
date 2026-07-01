import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type RawProcessRow = {
  ProcessId?: number | string;
  ParentProcessId?: number | string;
  Name?: string;
  WorkingSetSize?: number | string;
  CommandLine?: string;
};

export type ProcessMemoryEntry = {
  pid: number;
  parentPid: number;
  name: string;
  role: string;
  rssBytes: number;
};

export type ProcessMemorySnapshot = {
  rssBytes: number;
  processCount: number;
  byRole: Record<string, number>;
  processes: ProcessMemoryEntry[];
};

export type ProcessMemorySample = ProcessMemorySnapshot & {
  atMs: number;
  final?: boolean;
  error?: string;
};

export type ProcessMemorySummary = {
  initialRssBytes: number;
  peakRssBytes: number;
  finalRssBytes: number;
  deltaFinalMinusInitialBytes: number;
  peakSampleAtMs: number | null;
  maxProcessCount: number;
  rolePeakBytes: Record<string, number>;
  peakSampleRolesBytes: Record<string, number>;
  peakSampleProcesses: ProcessMemoryEntry[];
};

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const bytesToMiB = (bytes: number): number => bytes / 1024 / 1024;

async function readWindowsProcesses(): Promise<RawProcessRow[]> {
  const command = [
    "$ErrorActionPreference = 'SilentlyContinue';",
    "Get-CimInstance Win32_Process |",
    "Select-Object ProcessId, ParentProcessId, Name, WorkingSetSize, CommandLine |",
    "ConvertTo-Json -Compress",
  ].join(" ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as RawProcessRow | RawProcessRow[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function readPosixProcesses(): Promise<RawProcessRow[]> {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,rss=,comm=,args="], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout
    .split(/\r?\n/)
    .map((line): RawProcessRow | null => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
      if (!match) return null;
      return {
        ProcessId: match[1],
        ParentProcessId: match[2],
        Name: match[4],
        WorkingSetSize: Number(match[3]) * 1024,
        CommandLine: match[5] || match[4],
      };
    })
    .filter((row): row is RawProcessRow => row !== null);
}

async function readProcessRows(): Promise<RawProcessRow[]> {
  return os.platform() === "win32" ? readWindowsProcesses() : readPosixProcesses();
}

function classifyProcess(row: RawProcessRow, rootPid: number): string {
  const pid = toFiniteNumber(row.ProcessId);
  const commandLine = String(row.CommandLine ?? "").toLowerCase();
  const name = String(row.Name ?? "").toLowerCase();
  if (pid === rootPid) return name.includes("electron") ? "browser" : "launcher";

  const typeMatch = commandLine.match(/--type=([^\s"]+)/);
  if (typeMatch?.[1]) return typeMatch[1];
  if (commandLine.includes("--utility-sub-type=")) return "utility";
  if (name.includes("electron")) return "browser";
  return name || "unknown";
}

function isRelevantAppProcess(row: RawProcessRow, parentRow: RawProcessRow | undefined, rootPid: number): boolean {
  const pid = toFiniteNumber(row.ProcessId);
  if (pid === rootPid) return true;

  const commandLine = String(row.CommandLine ?? "").toLowerCase();
  const name = String(row.Name ?? "").toLowerCase();
  const parentName = String(parentRow?.Name ?? "").toLowerCase();

  if (name === "electron.exe" || name === "worker.exe") return true;
  if (commandLine.includes("math3d") || commandLine.includes("electron")) return true;
  if ((name === "cmd.exe" || name === "conhost.exe") && (parentName === "worker.exe" || parentName === "electron.exe")) {
    return true;
  }
  return false;
}

export async function sampleProcessTreeRss(rootPid: number): Promise<ProcessMemorySnapshot> {
  const rows = await readProcessRows();
  const byParent = new Map<number, number[]>();
  const byPid = new Map<number, RawProcessRow>();

  for (const row of rows) {
    const pid = toFiniteNumber(row.ProcessId);
    const parentPid = toFiniteNumber(row.ParentProcessId);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    byPid.set(pid, row);
    const siblings = byParent.get(parentPid) ?? [];
    siblings.push(pid);
    byParent.set(parentPid, siblings);
  }

  const stack = [rootPid];
  const seen = new Set<number>();
  const byRole: Record<string, number> = {};
  const processes: ProcessMemoryEntry[] = [];
  let rssBytes = 0;

  while (stack.length) {
    const pid = stack.pop();
    if (pid == null || seen.has(pid)) continue;
    seen.add(pid);

    const row = byPid.get(pid);
    if (row && isRelevantAppProcess(row, byPid.get(toFiniteNumber(row.ParentProcessId)), rootPid)) {
      const entry = {
        pid,
        parentPid: toFiniteNumber(row.ParentProcessId),
        name: String(row.Name ?? ""),
        role: classifyProcess(row, rootPid),
        rssBytes: toFiniteNumber(row.WorkingSetSize),
      };
      rssBytes += entry.rssBytes;
      byRole[entry.role] = (byRole[entry.role] ?? 0) + entry.rssBytes;
      processes.push(entry);
    }

    for (const childPid of byParent.get(pid) ?? []) {
      const childRow = byPid.get(childPid);
      if (!childRow || !row || isRelevantAppProcess(childRow, row, rootPid)) {
        stack.push(childPid);
      }
    }
  }

  processes.sort((a, b) => b.rssBytes - a.rssBytes);
  return { rssBytes, processCount: seen.size, byRole, processes };
}

export async function sampleProcessTreeSafely(rootPid: number, atMs: number): Promise<ProcessMemorySample> {
  try {
    return { atMs, ...(await sampleProcessTreeRss(rootPid)) };
  } catch (error) {
    return {
      atMs,
      rssBytes: 0,
      processCount: 0,
      byRole: {},
      processes: [],
      error: toErrorMessage(error),
    };
  }
}

export function summarizeProcessMemory(samples: ProcessMemorySample[]): ProcessMemorySummary {
  const validSamples = samples.filter((sample) => sample.rssBytes > 0);
  const initialSample = validSamples[0] ?? null;
  const finalSample = [...validSamples].reverse().find((sample) => sample.final) ?? validSamples.at(-1) ?? null;
  const peakSample = validSamples.reduce<ProcessMemorySample | null>(
    (best, sample) => (sample.rssBytes > (best?.rssBytes ?? 0) ? sample : best),
    null
  );

  const rolePeakBytes: Record<string, number> = {};
  for (const sample of validSamples) {
    for (const [role, bytes] of Object.entries(sample.byRole)) {
      rolePeakBytes[role] = Math.max(rolePeakBytes[role] ?? 0, bytes);
    }
  }

  return {
    initialRssBytes: initialSample?.rssBytes ?? 0,
    peakRssBytes: peakSample?.rssBytes ?? 0,
    finalRssBytes: finalSample?.rssBytes ?? 0,
    deltaFinalMinusInitialBytes: (finalSample?.rssBytes ?? 0) - (initialSample?.rssBytes ?? 0),
    peakSampleAtMs: peakSample?.atMs ?? null,
    maxProcessCount: Math.max(0, ...validSamples.map((sample) => sample.processCount)),
    rolePeakBytes,
    peakSampleRolesBytes: peakSample?.byRole ?? {},
    peakSampleProcesses: peakSample?.processes.slice(0, 8) ?? [],
  };
}
