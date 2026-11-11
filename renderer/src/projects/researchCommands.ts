import type { KernelWorkspaceModule, Math3DProject } from "@math3d/core";
import type { ProjectLibraryEntry } from "./projectLibrary";
import type { WorkbookStageId } from "@math3d/workbook";
import { projectStudyWorkbookReferences } from "./projectStudyReferences";

export type ResearchCommandTarget =
  | Readonly<{ kind: "gallery" | "current-project" | "cas" }>
  | Readonly<{ kind: "saved-project" | "study" | "result" | "workbook" | "note"; id: string }>
  | Readonly<{ kind: "document"; id: string; module: KernelWorkspaceModule }>
  | Readonly<{ kind: "citation"; id: string; stageId: WorkbookStageId; blockId: string }>;

export type ResearchCommand = Readonly<{
  key: string;
  title: string;
  detail: string;
  group: "Navigation" | "Projects" | "Studies" | "Results" | "Workbooks" | "Notes" | "Sources";
  target: ResearchCommandTarget;
  status?: string;
  unavailableReason?: string;
}>;

type Input = Readonly<{
  project: Math3DProject | null;
  savedProjects: readonly ProjectLibraryEntry[];
  workbookBytes: (id: string) => Uint8Array | null;
  workbookState: (id: string) => "available" | "missing" | "unverified";
  canOpenDocument: (id: string, module: KernelWorkspaceModule) => boolean;
  canOpenWorkbook: boolean;
  canOpenCas: boolean;
  preview: boolean;
  busy: boolean;
}>;

/** Search labels keep historical evidence visible; execution still uses the checked Project routes. */
export function buildResearchCommands(input: Input): readonly ResearchCommand[] {
  const { project, savedProjects, busy, preview } = input;
  const blocked = busy ? "A Project operation is in progress." : undefined;
  const commands: ResearchCommand[] = [
    { key: "gallery", title: "Open Projects Gallery", detail: "Browse saved and guided Projects", group: "Navigation",
      target: { kind: "gallery" }, unavailableReason: blocked },
    { key: "current-project", title: "Open current Project", detail: project?.metadata.title ?? "No active Project",
      group: "Navigation", target: { kind: "current-project" },
      unavailableReason: blocked ?? (!project ? "No Project is open." : undefined) },
    { key: "cas", title: "Open CAS / Algebra", detail: "Exact structures and saved algebra evidence",
      group: "Navigation", target: { kind: "cas" }, unavailableReason: blocked ?? (!input.canOpenCas ? "CAS is unavailable on this host." : undefined) },
  ];
  for (const saved of savedProjects) commands.push({ key: `project:${saved.id}`, title: `Open ${saved.title}`,
    detail: "Saved Project · opening reviews its stored source", group: "Projects",
    target: { kind: "saved-project", id: saved.id }, unavailableReason: blocked });
  if (!project) return commands;
  for (const study of project.workspace.studies ?? []) {
    commands.push({ key: `study:${study.id}`, title: `Open Study: ${study.title}`,
      detail: `${study.members.length} saved panes · ${project.metadata.title}`, group: "Studies",
      target: { kind: "study", id: study.id }, unavailableReason: blocked });
    for (const citation of projectStudyWorkbookReferences(project, study, input.workbookBytes))
      commands.push({ key: `citation:${study.id}:${citation.workbookId}:${citation.blockId}`,
        title: `Open citation: ${citation.title}`, detail: `Cites ${study.title} · ${citation.reason}`,
        group: "Workbooks", target: { kind: "citation", id: citation.workbookId,
          stageId: citation.stageId, blockId: citation.blockId }, status: citation.status,
        unavailableReason: blocked ?? (!input.canOpenWorkbook ? "Workbook editor is unavailable on this host." : undefined) });
  }
  for (const result of project.workspace.results) commands.push({ key: `result:${result.resultId}`,
    title: `Inspect result: ${result.provenance.operation.type}`,
    detail: `${result.resultId} · source revision ${result.provenance.source.revision}`,
    group: "Results", target: { kind: "result", id: result.resultId }, unavailableReason: blocked });
  for (const workbook of project.workbooks ?? []) {
    const state = input.workbookState(workbook.id);
    commands.push({ key: `workbook:${workbook.id}`, title: `Open Workbook: ${workbook.title}`,
      detail: `Revision ${workbook.revision} · ${state === "missing" ? "payload missing" : state === "unverified" ? "verify payload on open" : "saved payload available"}`,
      group: "Workbooks", target: { kind: "workbook", id: workbook.id }, status: state,
      unavailableReason: blocked ?? (!input.canOpenWorkbook ? "Workbook editor is unavailable on this host." :
        state === "missing" ? "Saved Workbook payload is missing." : undefined) });
  }
  for (const note of project.notes ?? []) commands.push({ key: `note:${note.identity.id}`,
    title: `Open Note: ${note.title}`, detail: note.anchor ? `Saved ${note.anchor.kind} anchor · source status checked on open` : "Unanchored Project Note",
    group: "Notes", target: { kind: "note", id: note.identity.id },
    unavailableReason: blocked ?? (preview ? "Open this Project before viewing its Notes." : undefined) });
  for (const entry of project.workspace.entries) commands.push({ key: `document:${entry.expected.id}`,
    title: `Open source: ${project.metadata.documents?.[entry.expected.id]?.title ?? entry.expected.id}`,
    detail: `${entry.module} · revision ${entry.expected.revision}`, group: "Sources",
    target: { kind: "document", id: entry.expected.id, module: entry.module },
    unavailableReason: blocked ?? (preview ? "Open this Project before navigating to its documents." :
      !input.canOpenDocument(entry.expected.id, entry.module) ? "This document editor is unavailable on the active host." : undefined) });
  return commands;
}

export function searchResearchCommands(commands: readonly ResearchCommand[], query: string): readonly ResearchCommand[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter(command => words.every(word =>
    `${command.title} ${command.detail} ${command.group} ${command.status ?? ""}`.toLocaleLowerCase().includes(word))).slice(0, 40);
}
