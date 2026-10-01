import type { Math3DProject } from "@math3d/core";
import { VerifiedProjectResources, type ProjectResourceSidecar } from "./projectResources";

const DATABASE = "math3d.project-resources.v1", STORE = "projects";
type Record = { id: string; projectId?: string; schemaVersion: 1; resources: ProjectResourceSidecar[] };
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
        const backup = store.get("before-open");
        backup.onsuccess = () => resolve(backup.result?.projectId === project.identity.id ? backup.result as Record : undefined);
        backup.onerror = () => reject(backup.error);
      };
      request.onerror = () => reject(request.error);
    });
    if (record && (record.schemaVersion !== 1 || (record.projectId ?? record.id) !== project.identity.id)) throw new TypeError("Unsupported saved resource archive.");
    return new VerifiedProjectResources(project, record?.resources ?? []);
  } finally { db.close(); }
};

/** Keep the IDB transaction open while the synchronous library/host commit runs.
 * A failed library write or activation aborts all resource writes. A later IDB
 * failure restores the exact project namespace and asks the host to roll back.
 */
export const commitProjectResources = async <T>(project: Math3DProject, resources: VerifiedProjectResources, commit: () => T, rollbackHost?: () => void,
  backup?: { project: Math3DProject; resources: VerifiedProjectResources }): Promise<T> => {
  const record: Record = { id: project.identity.id, schemaVersion: 1, resources: new VerifiedProjectResources(project, resources.sidecars()).sidecars() };
  const backupRecord: Record | null = backup ? { id: "before-open", projectId: backup.project.identity.id, schemaVersion: 1, resources: new VerifiedProjectResources(backup.project, backup.resources.sidecars()).sidecars() } : null;
  const db = await open();
  const before = new Map<string, string>();
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)!;
    if (key.startsWith("math3d.project")) before.set(key, localStorage.getItem(key)!);
  }
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      let result: T, failure: unknown, attempted = false;
      const store = transaction.objectStore(STORE);
      let request = store.put(record);
      if (backupRecord) request = store.put(backupRecord);
      request.onsuccess = () => {
        try { attempted = true; result = commit(); } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result!);
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
