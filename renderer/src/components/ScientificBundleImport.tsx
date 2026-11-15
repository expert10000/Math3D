import { useState } from "react";
import type { ScientificUploadKind } from "../projects/scientificBundleImport";

export type ScientificImportDestination = "new" | "current";
export function ScientificBundleImport({ disabled, canAdd = false, onImport }: {
  disabled: boolean; canAdd?: boolean;
  onImport: (files: File[], kind: ScientificUploadKind, destination: ScientificImportDestination) => Promise<void>;
}) {
  const [reading, setReading] = useState(false);
  const [destination, setDestination] = useState<ScientificImportDestination>("new");
  const choose = async (files: File[], kind: ScientificUploadKind) => {
    if (!files.length || reading || disabled) return;
    setReading(true);
    try { await onImport(files, kind, destination); } finally { setReading(false); }
  };
  return <fieldset disabled={disabled || reading} data-testid="scientific-bundle-import" style={{ margin: "12px 0" }}>
    <legend>Import scientific data</legend>
    <p>Import verified scientific datasets from a folder or ZIP.</p>
    <label>Import destination <select data-testid="scientific-import-destination" value={destination}
      onChange={event => setDestination(event.target.value as ScientificImportDestination)}>
      <option value="new">Create new Project</option>
      <option value="current" disabled={!canAdd}>Add to current Project</option>
    </select></label>
    {!canAdd && <p>Open or save a Project first to add another scientific bundle.</p>}
    {destination === "current" && <p>Review the combined Project before adding datasets. Existing sources and saved work are retained.</p>}
    <label className="project-workspace-file">Choose .sscene folder
      <input type="file" multiple data-testid="scientific-import-folder"
        ref={element => { element?.setAttribute("webkitdirectory", ""); }}
        onChange={event => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ""; void choose(files, "folder"); }} />
    </label>
    <label className="project-workspace-file">Choose scientific ZIP
      <input type="file" accept=".zip,application/zip" data-testid="scientific-import-zip"
        onChange={event => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ""; void choose(files, "zip"); }} />
    </label>
    <small>Complete v1 vector grids, 2–32 samples per axis; up to 4 MiB. Component units must match coordinates per second. ZIP also works when folder selection is unavailable.</small>
    {reading && <p role="status">Reading and verifying scientific data…</p>}
  </fieldset>;
}
