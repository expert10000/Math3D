import { useState } from "react";
import type { ScientificUploadKind } from "../projects/scientificBundleImport";

export function ScientificBundleImport({ disabled, onImport }: {
  disabled: boolean; onImport: (files: File[], kind: ScientificUploadKind) => Promise<void>;
}) {
  const [reading, setReading] = useState(false);
  const choose = async (files: File[], kind: ScientificUploadKind) => {
    if (!files.length || reading || disabled) return;
    setReading(true);
    try { await onImport(files, kind); } finally { setReading(false); }
  };
  return <fieldset disabled={disabled || reading} data-testid="scientific-bundle-import" style={{ margin: "12px 0" }}>
    <legend>Import scientific data</legend>
    <p>Create a Project from a scientific folder or ZIP. Files are verified in this browser before you open it.</p>
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
