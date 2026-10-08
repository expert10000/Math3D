import type { Math3DProject } from "@math3d/core";
import { VerifiedProjectResources, type ProjectResourceSidecar, type ProjectResourceBytes } from "./projectResources";

const DATABASE = "math3d.project-resources.v1", STORE = "projects";
const BACKUP_SLOT_KEY = "math3d.project-resource-backup-slot.v1";
const BACKUP_SLOTS = ["before-open-a", "before-open-b"] as const;
const primaryArchiveResources = new WeakSet<VerifiedProjectResources>();
const missingArchiveResources = new WeakSet<VerifiedProjectResources>();
/** A verified dedicated archive, or a verified empty read with no archive,
 * can be activated without rewriting the Project resource record.
 */
export const canReuseProjectResourceArchive = (project: Math3DProject, resources: VerifiedProjectResources): boolean =>
  (primaryArchiveResources.has(resources) || missingArchiveResources.has(resources) && resources.byteEntries().length === 0) && resources.verifiedFor(project);
type Record = { id: string; projectId?: string } & (
  { schemaVersion: 1; resources: ProjectResourceSidecar[] } |
  { schemaVersion: 2; resources: ProjectResourceBytes[] }
);
const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error("Project resource storage is blocked by another window."));
});

/** Binary sidecars have their own transactional disk store, outside localStorage's small JSON quota. */
export const loadProjectResources = async (project: Math3DProject): Promise<VerifiedProjectResources> => {
  const db = await open();
  try {
    const record = await new Promise<Record | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE), store = transaction.objectStore(STORE), request = store.get(project.identity.id);
      request.onsuccess = () => {
        if (request.result) { resolve(request.result as Record); return; }
        const savedSlot = localStorage.getItem(BACKUP_SLOT_KEY);
        const backup = store.get(BACKUP_SLOTS.includes(savedSlot as typeof BACKUP_SLOTS[number]) ? savedSlot! : "before-open");
        backup.onsuccess = () => resolve(backup.result?.projectId === project.identity.id ? backup.result as Record : undefined);
        backup.onerror = () => reject(backup.error);
      };
      request.onerror = () => reject(request.error);
    });
    if (record && (![1, 2].includes(record.schemaVersion) || (record.projectId ?? record.id) !== project.identity.id)) throw new TypeError("Unsupported saved resource archive.");
    const resources = record?.schemaVersion === 2 ? new VerifiedProjectResources(project, [], record.resources) : new VerifiedProjectResources(project, record?.resources ?? []);
    if (record?.id === project.identity.id) primaryArchiveResources.add(resources);
    else if (!record) missingArchiveResources.add(resources);
    return resources;
  } finally { db.close(); }
};

/** Stage the current workspace's binary backup while the Gallery is being read.
 * The inactive slot never overwrites the backup referenced by the last Open.
 */
export const stageProjectBackupResources = async (project: Math3DProject, resources: VerifiedProjectResources): Promise<typeof BACKUP_SLOTS[number]> => {
  if (!resources.verifiedFor(project)) throw new TypeError("Project backup resources do not match their workspace.");
  const slot = localStorage.getItem(BACKUP_SLOT_KEY) === BACKUP_SLOTS[0] ? BACKUP_SLOTS[1] : BACKUP_SLOTS[0];
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ id: slot, projectId: project.identity.id, schemaVersion: 2, resources: resources.byteEntries() } satisfies Record);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("Project backup staging failed."));
      transaction.onerror = () => reject(transaction.error);
    });
    return slot;
  } finally { db.close(); }
};

/** Keep the IDB transaction open while the synchronous library/host commit runs.
 * A failed library write or activation aborts all resource writes. A later IDB
 * failure restores the exact project namespace and asks the host to roll back.
 */
export const commitProjectResources = async <T>(project: Math3DProject, resources: VerifiedProjectResources, commit: () => T, rollbackHost?: () => void,
  backup?: { project: Math3DProject; resources: VerifiedProjectResources },
  options: { reuseExistingProject?: boolean; stagedBackupSlot?: typeof BACKUP_SLOTS[number] } = {}): Promise<T> => {
  const started = performance.now();
  const measure = (name: string, from: number) => {
    performance.clearMeasures(`project-resource-commit:${name}`);
    performance.measure(`project-resource-commit:${name}`, { start: from, end: performance.now() });
  };
  const record: Record = { id: project.identity.id, schemaVersion: 2,
    resources: (resources.verifiedFor(project) ? resources : new VerifiedProjectResources(project, [], resources.byteEntries())).byteEntries() };
  const backupRecord: Record | null = backup ? { id: "before-open", projectId: backup.project.identity.id, schemaVersion: 2,
    resources: (backup.resources.verifiedFor(backup.project) ? backup.resources : new VerifiedProjectResources(backup.project, [], backup.resources.byteEntries())).byteEntries() } : null;
  performance.clearMarks("project-resource-commit:counts");
  performance.mark("project-resource-commit:counts", { detail: {
    project: record.resources.length, backup: backupRecord?.resources.length ?? 0,
    projectBytes: record.resources.reduce((total, resource) => total + resource.bytes.byteLength, 0),
    backupBytes: backupRecord?.resources.reduce((total, resource) => total + resource.bytes.byteLength, 0) ?? 0,
    reuseRequested: !!options.reuseExistingProject,
  } });
  measure("record-prep", started);
  const snapshotStart = performance.now();
  const before = new Map<string, string>();
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)!;
    if (key.startsWith("math3d.project")) before.set(key, localStorage.getItem(key)!);
  }
  measure("storage-snapshot", snapshotStart);
  // A saved library Project has already loaded and verified its archive (or
  // verified that no archive is present). With no pending binary backup write,
  // activation only changes local Project pointers.
  if (options.reuseExistingProject && (!backupRecord?.resources.length || options.stagedBackupSlot)) {
    const fastStart = performance.now();
    try {
      const result = commit();
      if (options.stagedBackupSlot) localStorage.setItem(BACKUP_SLOT_KEY, options.stagedBackupSlot);
      else if (backupRecord) localStorage.removeItem(BACKUP_SLOT_KEY);
      measure("fast-activation", fastStart);
      performance.clearMeasures("project-resource-commit:transaction");
      return result;
    } catch (failure) {
      try {
        const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!).filter((key) => key.startsWith("math3d.project"));
        for (const key of keys) if (!before.has(key)) localStorage.removeItem(key);
        for (const [key, value] of before) if (localStorage.getItem(key) !== value) localStorage.setItem(key, value);
        rollbackHost?.();
      } catch (rollbackError) { throw new AggregateError([failure, rollbackError], "Project activation and rollback failed; saved payloads were retained."); }
      throw failure;
    }
  }
  const opening = performance.now();
  const db = await open();
  measure("database-open", opening);
  const transactionStart = performance.now();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      let result: T, failure: unknown, attempted = false;
      const store = transaction.objectStore(STORE);
      // A verified saved archive already contains the opened Project. The
      // previous workspace backup still participates in this transaction.
      const writeProject = !options.reuseExistingProject;
      let request = writeProject ? store.put(record) : store.put(backupRecord!);
      if (writeProject && backupRecord && !options.stagedBackupSlot) request = store.put(backupRecord);
      request.onsuccess = () => {
        measure("write-request", transactionStart);
        const callbackStart = performance.now();
        try {
          attempted = true; result = commit();
          if (options.stagedBackupSlot) localStorage.setItem(BACKUP_SLOT_KEY, options.stagedBackupSlot);
          else if (backupRecord) localStorage.removeItem(BACKUP_SLOT_KEY);
        } catch (error) { failure = error; transaction.abort(); }
        measure("commit-callback", callbackStart);
      };
      transaction.oncomplete = () => { measure("transaction", transactionStart); resolve(result!); };
      transaction.onabort = () => {
        if (attempted) {
          try {
            const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!).filter((key) => key.startsWith("math3d.project"));
            for (const key of keys) if (!before.has(key)) localStorage.removeItem(key);
            for (const [key, value] of before) if (localStorage.getItem(key) !== value) localStorage.setItem(key, value);
            rollbackHost?.();
          } catch (error) { failure = new AggregateError([failure ?? transaction.error, error], "Resource commit and rollback failed; saved payloads were retained."); }
        }
        reject(failure ?? transaction.error ?? new Error("Resource storage transaction failed."));
      };
      transaction.onerror = () => { failure ??= transaction.error; };
    });
  } finally { db.close(); }
};
