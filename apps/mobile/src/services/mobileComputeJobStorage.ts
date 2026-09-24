import { Directory, File, Paths } from "expo-file-system";
import type { MobileComputeJob } from "../models/mobileComputeJobs";

const JOB_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const JOB_FILE_NAME = "compute-jobs.json";
const MAX_JOBS = 40;

const storageDirectory = new Directory(Paths.document, STORAGE_DIR_NAME);
const jobsFile = new File(storageDirectory, JOB_FILE_NAME);

const ensureStorageLocation = () => {
  storageDirectory.create({ idempotent: true, intermediates: true });
  if (!jobsFile.exists) jobsFile.create({ intermediates: true, overwrite: true });
};

const isPersistedJob = (value: unknown): value is MobileComputeJob => {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<MobileComputeJob>;
  return (
    typeof job.jobId === "string" &&
    typeof job.surfaceId === "string" &&
    typeof job.workerBaseUrl === "string" &&
    typeof job.request === "object" &&
    job.request !== null &&
    job.request.jobId === job.jobId &&
    typeof job.request.inputHash === "string" &&
    typeof job.status === "string" &&
    typeof job.progress === "number" &&
    typeof job.createdAt === "number" &&
    typeof job.updatedAt === "number" &&
    typeof job.attempt === "number" &&
    Array.isArray(job.diagnostics)
  );
};

export const loadMobileComputeJobs = async (): Promise<MobileComputeJob[]> => {
  try {
    ensureStorageLocation();
    const raw = await jobsFile.text();
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as { schemaVersion?: number; jobs?: unknown[] };
    if (parsed.schemaVersion !== JOB_SCHEMA_VERSION || !Array.isArray(parsed.jobs)) return [];
    return parsed.jobs.filter(isPersistedJob).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_JOBS);
  } catch {
    return [];
  }
};

export const saveMobileComputeJobs = async (jobs: MobileComputeJob[]): Promise<void> => {
  ensureStorageLocation();
  const persisted = [...jobs]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_JOBS)
    .map((job) => ({ ...job }));
  jobsFile.write(JSON.stringify({ schemaVersion: JOB_SCHEMA_VERSION, jobs: persisted }, null, 2), {
    encoding: "utf8",
  });
};

export const clearMobileComputeJobs = async (): Promise<void> => {
  await saveMobileComputeJobs([]);
};
