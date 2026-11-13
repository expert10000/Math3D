import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { styles } from "../mobileAppStyles";
import { buildMobileProjectExplorer } from "../models/mobileProjectExplorer";
import type { MobileProjectNoteInput } from "../models/mobileProjectNotes";
import type { ProjectResourceSidecar } from "@math3d/core";
import { MobileVectorField3DViewer } from "./MobileVectorField3DViewer";
import { speakScientificUnit } from "../models/mobileScientificSpeech";

export const MobileProjectExplorer: React.FC<{ raw: string; resources?: readonly ProjectResourceSidecar[]; onOpenGraph?: (id: string) => void;
  onOpenSurface?: (id: string) => void; onOpenCurve?: (id: string) => void; onRefresh?: (relationId: string) => Promise<boolean>;
  onSaveNote?: (input: MobileProjectNoteInput) => Promise<boolean> }> = ({ raw, resources, onOpenGraph, onOpenSurface, onOpenCurve, onRefresh, onSaveNote }) => {
  const [refreshing, setRefreshing] = React.useState(false);
  const [workbookId, setWorkbookId] = useState<string | null>(null);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [complexId, setComplexId] = useState<string | null>(null);
  const [vector3dId, setVector3dId] = useState<string | null>(null);
  const [scientificId, setScientificId] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<MobileProjectNoteInput | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const state = useMemo(() => {
    try { return { explorer: buildMobileProjectExplorer(raw, resources), error: null }; }
    catch (error) { return { explorer: null, error: (error as Error).message }; }
  }, [raw, resources]);
  useEffect(() => { setWorkbookId(null); setStudyId(null); setNoteId(null); setComplexId(null); setVector3dId(null); setScientificId(null); setResultId(null); setNoteDraft(null); }, [state.explorer?.projectId]);
  if (!state.explorer) return <Text accessibilityRole="alert" style={styles.note}>{state.error}</Text>;
  const { groups, relations, results, workbooks, notes, studies } = state.explorer;
  const selectedStudy = studies.find(item => item.id === studyId);
  const selectedWorkbook = workbooks.find(item => item.id === workbookId);
  const selectedNote = notes.find(item => item.id === noteId);
  const titles = new Map(groups.flatMap(group => group.documents.map(document => [document.id, document.title] as const)));
  return <View testID="mobile-project-document-explorer" style={styles.projectEditor}>
    <Text accessibilityRole="header" style={styles.itemTitle}>Project → Workbook → Note</Text>
    <Text style={styles.note}>{state.explorer.title} · {studies.length} Studies · {workbooks.length} {workbooks.length === 1 ? "Workbook" : "Workbooks"} · {notes.length} {notes.length === 1 ? "Note" : "Notes"}</Text>
    <Text accessibilityRole="header" style={styles.itemTitle}>Studies ({studies.length})</Text>
    {studies.map(study => <Pressable key={study.id} testID={`mobile-project-study-${study.id}`}
      accessibilityRole="button" onPress={() => setStudyId(study.id === studyId ? null : study.id)}
      style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>{study.title} · {study.mode}</Text></Pressable>)}
    {selectedStudy && <View testID="mobile-project-study-detail">
      <Text accessibilityRole="header" style={styles.itemTitle}>{selectedStudy.title}</Text>
      {!!selectedStudy.description && <Text style={styles.note}>{selectedStudy.description}</Text>}
      <Text style={styles.itemMeta}>Pinned selections: {selectedStudy.pinnedSelections}</Text>
      {selectedStudy.panes.map(pane => <Text key={pane.id}
        testID={`mobile-project-study-pane-${pane.id}`} style={styles.note}>
        {pane.role} · {titles.get(pane.documentId) ?? pane.documentId} · {pane.status}. {pane.reason}
      </Text>)}
      {selectedStudy.citations.map(citation => <Pressable key={`${citation.workbookId}:${citation.blockId}`}
        testID={`mobile-project-study-citation-${citation.blockId}`} accessibilityRole="button"
        onPress={() => setWorkbookId(citation.workbookId)} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>{citation.title} · {citation.status}</Text>
      </Pressable>)}
      {selectedStudy.noteIds.map(id => {
        const note = notes.find(item => item.id === id);
        return note ? <Pressable key={id} testID={`mobile-project-study-note-${id}`}
          accessibilityRole="button" onPress={() => setNoteId(id)} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>{note.title} · {note.status}</Text>
        </Pressable> : null;
      })}
    </View>}
    <Text accessibilityRole="header" style={styles.itemTitle}>Workbooks ({workbooks.length})</Text>
    {workbooks.map(workbook => <Pressable key={workbook.id} testID={`mobile-project-workbook-${workbook.id}`}
      accessibilityRole="button" onPress={() => { setWorkbookId(workbook.id === workbookId ? null : workbook.id); setNoteId(null); }} style={styles.secondaryBtn}>
      <Text style={styles.secondaryBtnText}>{workbook.title} · revision {workbook.revision}{workbook.available ? "" : " · payload unavailable"}</Text>
    </Pressable>)}
    {selectedWorkbook && <View testID="mobile-project-workbook-detail">
      <Text accessibilityRole="header" style={styles.itemTitle}>{selectedWorkbook.title}</Text>
      {!selectedWorkbook.available && <Text style={styles.note}>Import this Project with resources to read its Workbook.</Text>}
      {selectedWorkbook.stages.map(stage => <View key={stage.id}>
        <Text accessibilityRole="header" style={styles.itemTitle}>{stage.title}</Text>
        {stage.blocks.map(block => <View key={block.id}>
          <Text style={styles.itemMeta}>{block.title} · {block.type}</Text>
          {!!block.text && <Text style={styles.note}>{block.text}</Text>}
          {!!block.formula && <Text style={styles.note}>{block.formula}</Text>}
          {block.citation && <Text testID={`mobile-project-citation-${block.id}`} style={styles.itemMeta}>
            Citation: {block.citation.status} · {block.citation.reason}</Text>}
          {onSaveNote && <Pressable testID={`mobile-project-note-on-block-${block.id}`} accessibilityRole="button" style={styles.secondaryBtn}
            onPress={() => { setNoteDraft({ title: `Note on ${block.title}`, body: "", workbookBlock: { workbookId: selectedWorkbook.id, blockId: block.id } }); setNoteMessage(""); }}>
            <Text style={styles.secondaryBtnText}>Note on this block</Text>
          </Pressable>}
          {notes.filter(note => note.anchor?.kind === "workbook-block" && note.anchor.workbookId === selectedWorkbook.id && note.anchor.blockId === block.id)
            .map(note => <Pressable key={note.id} testID={`mobile-project-workbook-note-${note.id}`} accessibilityRole="button"
              onPress={() => setNoteId(note.id)} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Note: {note.title} · {note.status}</Text></Pressable>)}
        </View>)}
      </View>)}
    </View>}
    <Text accessibilityRole="header" style={styles.itemTitle}>Notes ({notes.length})</Text>
    {onSaveNote && <Pressable testID="mobile-project-new-note" accessibilityRole="button" style={styles.secondaryBtn}
      onPress={() => { setNoteDraft({ title: "", body: "" }); setNoteMessage(""); }}><Text style={styles.secondaryBtnText}>New Project Note</Text></Pressable>}
    {notes.map(note => <Pressable key={note.id} testID={`mobile-project-note-${note.id}`} accessibilityRole="button"
      onPress={() => { setNoteId(note.id === noteId ? null : note.id); if (note.anchor?.kind === "workbook-block") setWorkbookId(note.anchor.workbookId); }} style={styles.secondaryBtn}>
      <Text style={styles.secondaryBtnText}>{note.title} · {note.status}</Text>
    </Pressable>)}
    {selectedNote && <View testID="mobile-project-note-detail">
      <Text accessibilityRole="header" style={styles.itemTitle}>{selectedNote.title}</Text>
      <Text style={styles.note}>{selectedNote.body}</Text>
      <Text style={styles.itemMeta}>Anchor: {selectedNote.status}</Text>
      <Text style={styles.itemMeta}>{selectedNote.reason}</Text>
      {onSaveNote && <Pressable testID="mobile-project-edit-note" accessibilityRole="button" style={styles.secondaryBtn}
        onPress={() => { setNoteDraft({ noteId: selectedNote.id, title: selectedNote.title, body: selectedNote.body }); setNoteMessage(""); }}>
        <Text style={styles.secondaryBtnText}>Edit Note</Text>
      </Pressable>}
    </View>}
    {noteDraft && onSaveNote && <View testID="mobile-project-note-editor" style={styles.projectEditor}>
      <Text accessibilityRole="header" style={styles.itemTitle}>{noteDraft.noteId ? "Edit Project Note" : noteDraft.workbookBlock ? "Note on Workbook block" : "New Project Note"}</Text>
      <TextInput testID="mobile-project-note-title" accessibilityLabel="Note title" value={noteDraft.title} maxLength={160}
        onChangeText={title => setNoteDraft(current => current ? { ...current, title } : null)} style={styles.textInput} />
      <TextInput testID="mobile-project-note-body" accessibilityLabel="Note body" value={noteDraft.body} maxLength={8192} multiline
        onChangeText={body => setNoteDraft(current => current ? { ...current, body } : null)} style={[styles.textInput, { minHeight: 100, textAlignVertical: "top" }]} />
      <Pressable testID="mobile-project-save-note" accessibilityRole="button" disabled={noteSaving || !noteDraft.title.trim() || !noteDraft.body.trim()}
        accessibilityState={{ disabled: noteSaving || !noteDraft.title.trim() || !noteDraft.body.trim() }} style={styles.primaryBtn}
        onPress={() => { setNoteSaving(true); void onSaveNote(noteDraft).then(saved => { setNoteMessage(saved ? "Project Note saved." : "Project Note could not be saved."); if (saved) setNoteDraft(null); })
          .catch(error => setNoteMessage(`Project Note could not be saved: ${error instanceof Error ? error.message : String(error)}`))
          .finally(() => setNoteSaving(false)); }}>
        <Text style={styles.primaryBtnText}>{noteSaving ? "Saving…" : "Save Note"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.secondaryBtn} onPress={() => setNoteDraft(null)}><Text style={styles.secondaryBtnText}>Cancel</Text></Pressable>
    </View>}
    {!!noteMessage && <Text accessibilityRole="alert" style={styles.note}>{noteMessage}</Text>}
    <Text accessibilityRole="header" style={styles.itemTitle}>Scientific recipes ({state.explorer.scientificContracts.length})</Text>
    {state.explorer.scientificContracts.map(item => <View key={item.id}>
      <Pressable testID={`mobile-scientific-contract-${item.id}`} accessibilityRole="button"
        accessibilityLabel={item.spokenSummary}
        accessibilityHint={scientificId === item.id ? "Collapse scientific details" : "Expand scientific details"}
        accessibilityState={{ expanded: scientificId === item.id }}
        onPress={() => setScientificId(scientificId === item.id ? null : item.id)}
        focusable style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>{item.title} · {item.status}</Text>
      </Pressable>
      {scientificId === item.id && <Text accessibilityLiveRegion="polite"
        testID="mobile-scientific-contract-detail" style={styles.note}>
        {item.kind} · ID {item.id} · status {item.status} · source {item.sourceId}. {item.detail}
      </Text>}
    </View>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Documents and relations</Text>
    {groups.filter(group => group.documents.length).map(group => <View key={group.module}>
      <Text accessibilityRole="header" style={styles.itemTitle}>{group.title} ({group.documents.length})</Text>
      {group.documents.map(document => <View key={document.id} testID={`mobile-project-document-${document.id}`}>
        <Text style={styles.itemMeta}>{document.title} · revision {document.revision}</Text>
        <Text style={styles.note}>{document.editing}{document.archived ? " · archived" : ""}{document.stale ? " · historical dependency" : ""}</Text>
        {document.module === "vector3d" && document.vector3dPreview && <>
          <Pressable testID={`mobile-project-view-vector3d-${document.id}`} accessibilityRole="button"
            onPress={() => setVector3dId(vector3dId === document.id ? null : document.id)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>{vector3dId === document.id ? "Hide" : "View"} 3D vector field</Text>
          </Pressable>
          {vector3dId === document.id && <MobileVectorField3DViewer
            key={`${document.id}:${document.revision}`} document={document.vector3dPreview} />}
        </>}
        {document.module === "vector3d" && document.unavailableReason &&
          <Text style={styles.note}>{document.unavailableReason}</Text>}
        {document.module === "complex" && document.complexPreview && <>
          <Pressable testID={`mobile-project-view-complex-${document.id}`} accessibilityRole="button"
            onPress={() => setComplexId(complexId === document.id ? null : document.id)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>{complexId === document.id ? "Hide" : "View"} Complex contour</Text>
          </Pressable>
          {complexId === document.id && <View testID="mobile-project-complex-detail">
            <Text style={styles.itemMeta}>f(z) = {document.complexPreview.functionText}</Text>
            {document.complexPreview.contours.map(contour => <Text key={contour.id} style={styles.itemMeta}>
              {contour.id}: {contour.points} points · {contour.closed ? "closed" : "open"}
            </Text>)}
            <Text style={styles.note}>{document.complexPreview.graphStatus}</Text>
            {document.complexPreview.mapping && <Text style={styles.note}>Mapping: {document.complexPreview.mapping}</Text>}
            {document.complexPreview.scientific && <>
              <Text style={styles.note}>Grid {document.complexPreview.scientific.sceneId}/{document.complexPreview.scientific.datasetId}; {document.complexPreview.scientific.fixedName} = {document.complexPreview.scientific.fixedCoordinate} {document.complexPreview.scientific.fixedUnit}; varying {document.complexPreview.scientific.varyingName} ({document.complexPreview.scientific.varyingUnit}).</Text>
              <Text style={styles.note}>External scientific bundle not checked on mobile. Fingerprint {document.complexPreview.scientific.fingerprint}.</Text>
            </>}
            <Text style={styles.note}>Read-only saved contour; use desktop Complex Analysis to edit or refresh.</Text>
          </View>}
        </>}
        {document.module === "curve" && onOpenCurve && <>
          <Pressable testID={`mobile-project-edit-curve-${document.id}`} disabled={document.editing !== "Curve workspace"}
            accessibilityState={{ disabled: document.editing !== "Curve workspace" }} onPress={() => onOpenCurve(document.id)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Edit Curve</Text>
          </Pressable>
          {document.unavailableReason && <Text style={styles.note}>{document.unavailableReason}</Text>}
        </>}
        {document.module === "surface" && onOpenSurface && <>
          <Pressable testID={`mobile-project-edit-surface-${document.id}`} disabled={document.editing !== "Surface workspace"}
            accessibilityState={{ disabled: document.editing !== "Surface workspace" }} onPress={() => onOpenSurface(document.id)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Edit Surface</Text>
          </Pressable>
          {document.unavailableReason && <Text style={styles.note}>{document.unavailableReason}</Text>}
        </>}
        {document.module === "graph2d" && onOpenGraph && <>
          <Pressable testID={`mobile-project-edit-graph-${document.id}`} disabled={document.editing !== "Graph workspace"}
            accessibilityState={{ disabled: document.editing !== "Graph workspace" }} onPress={() => onOpenGraph(document.id)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Edit Graph</Text>
          </Pressable>
          {document.unavailableReason && <Text style={styles.note}>{document.unavailableReason}</Text>}
        </>}
      </View>)}
    </View>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Relations ({relations.length})</Text>
    {relations.map(relation => <View key={relation.relationId}>
      <Text style={styles.itemMeta}>{relation.sources.map(source => titles.get(source.documentId) ?? "Missing source").join(" + ")} → {relation.target.type === "document" ? titles.get(relation.target.generation.documentId) ?? "Missing document" : relation.target.type === "result" ? "Analysis" : "Artifact"}</Text>
      <Text style={styles.note}>{relation.operation} · {relation.freshness}</Text>
      {onRefresh && state.explorer.refreshOptions.filter(option => option.relationId === relation.relationId).map(option => <View key={option.relationId}>
        <Pressable testID={`mobile-project-refresh-${option.relationId}`} accessibilityRole="button"
          disabled={!option.canRefresh || refreshing} accessibilityState={{ disabled: !option.canRefresh || refreshing }} style={styles.secondaryBtn}
          onPress={() => { setRefreshing(true); void onRefresh(option.relationId).finally(() => setRefreshing(false)); }}>
          <Text style={styles.secondaryBtnText}>Create refreshed {option.kind}</Text>
        </Pressable>
        <Text style={styles.note}>{option.reason}</Text>
      </View>)}
    </View>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Analysis ({results.length})</Text>
    {results.map(result => <View key={result.id}>
      <Pressable testID={`mobile-scientific-result-${result.id}`}
        accessibilityRole="button" focusable
        accessibilityState={{ expanded: resultId === result.id }}
        accessibilityHint={resultId === result.id ? "Collapse result provenance" : "Expand result provenance"}
        accessibilityLabel={`${result.operation}. Unit ${speakScientificUnit(result.unit)}. ` +
          `Source revision ${result.sourceRevision}. ` +
          (result.freshness === "current" ?
            "Saved summary only. Scientific values require verification before display." :
            `Values withheld because ${result.freshness.replaceAll("-", " ")}.`) +
          " Expand for full source provenance."}
        style={styles.secondaryBtn} onPress={() => setResultId(resultId === result.id ? null : result.id)}>
        <Text style={styles.secondaryBtnText}>{result.operation} · {result.freshness}</Text>
      </Pressable>
      {resultId === result.id && <Text accessibilityLiveRegion="polite" style={styles.note}>
        Unit {result.unit}. Source {titles.get(result.sourceDocumentId) ?? "Missing source"},
        revision {result.sourceRevision}, hash {result.sourceHash}.
        {result.freshness === "current" ?
          " Saved summary retained; verify scientific source before viewing values." :
          ` Values withheld: ${result.freshness}.`}
      </Text>}
    </View>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Source resources ({state.explorer.resources.filter(item => item.available).length}/{state.explorer.resources.length})</Text>
    {state.explorer.resources.map(item => <Text key={`${item.kind}:${item.id}`} style={styles.itemMeta}>{item.kind} · {item.available ? "Verified and retained" : item.required ? "Missing source bytes" : "Optional cache unavailable"}</Text>)}
    <Text style={styles.note}>Import a desktop project package to retain Graph tables, Mesh and Volume source bytes. Package export includes verified retained bytes; missing resources stay missing. Edit an available Graph, Curve or Surface without changing other documents. Saved 3D vector fields have a read-only viewer; analysis artifact bytes may require separate transfer.</Text>
  </View>;
};
