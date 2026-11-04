import { useEffect, useMemo, useRef, useState } from "react";
import { buildDerivedProfileProvenance, type DerivedProfileProvenance,
  type DerivedFieldProfileResult, type Math3DProject, type VectorField3DDocument } from "@math3d/core";
import { createDerivedFieldProfileJob } from "@math3d/kernel";

const verifySource = (source: VectorField3DDocument) => source.source.field.kind === "expressions";
export function useDerivedProfileProvenance(project: Math3DProject | null | undefined) {
  const projectRef = useRef(project);
  projectRef.current = project;
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const job = useMemo(() => createDerivedFieldProfileJob({ project: () => {
    if (!projectRef.current) throw new TypeError("No active Project.");
    return projectRef.current;
  }, verifySource }), [project?.identity.id]);
  useEffect(() => () => job.dispose(), [job]);
  const records = useMemo(() => {
    if (!project) return [] as DerivedProfileProvenance[];
    return (project.workspace.derivedFields ?? []).flatMap(field => {
      if (field.operation.kind !== "line-profile") return [];
      try { return [buildDerivedProfileProvenance(project, field.identity.id,
        { verifySource, result: job.read(field.identity.id) })]; }
      catch { return []; }
    });
  }, [project, job, version]);
  const compute = async (id: string): Promise<DerivedFieldProfileResult | null> => {
    if (busyId) return null;
    setBusyId(id); setError(""); setProgress("");
    try {
      const outcome = await job.submit(id, { onProgress: (completed, total) =>
        setProgress(`${completed}/${total} samples computed`) }).promise;
      if (outcome.publication !== "published")
        setError(`Profile result withheld: ${outcome.publication}.`);
      return outcome.publication === "published" ? outcome.result : null;
    } catch (cause) { setError(String((cause as Error).message ?? cause)); return null; }
    finally { setBusyId(null); setVersion(current => current + 1); }
  };
  return { records, compute, read: (id: string) => job.read(id), busyId, progress, error };
}
