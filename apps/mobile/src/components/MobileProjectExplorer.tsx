import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { styles } from "../mobileAppStyles";
import { buildMobileProjectExplorer } from "../models/mobileProjectExplorer";
import type { MobileProjectNoteInput } from "../models/mobileProjectNotes";
import type { ProjectResourceSidecar } from "@math3d/core";

export const MobileProjectExplorer: React.FC<{ raw: string; resources?: readonly ProjectResourceSidecar[]; onOpenGraph?: (id: string) => void;
  onOpenSurface?: (id: string) => void; onOpenCurve?: (id: string) => void; onRefresh?: (relationId: string) => Promise<boolean>;
  onSaveNote?: (input: MobileProjectNoteInput) => Promise<boolean> }> = ({ raw, resources, onOpenGraph, onOpenSurface, onOpenCurve, onRefresh, onSaveNote }) => {
  const [refreshing, setRefreshing] = React.useState(false);
  const [workbookId, setWorkbookId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<MobileProjectNoteInput | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const state = useMemo(() => {
    try { return { explorer: buildMobileProjectExplorer(raw, resources), error: null }; }
    catch (error) { return { explorer: null, error: (error as Error).message }; }
  }, [raw, resources]);
  useEffect(() => { setWorkbookId(null); setNoteId(null); setNoteDraft(null); }, [state.explorer?.projectId]);
  if (!state.explorer) return <Text accessibilityRole="alert" style={styles.note}>{state.error}</Text>;
  const { groups, relations, results, workbooks, notes } = state.explorer;
  const selectedWorkbook = workbooks.find(item => item.id === workbookId);
  const selectedNote = notes.find(item => item.id === noteId);
  const titles = new Map(groups.flatMap(group => group.documents.map(document => [document.id, document.title] as const)));
  return <View testID="mobile-project-document-explorer" style={styles.projectEditor}>
    <Text accessibilityRole="header" style={styles.itemTitle}>Project → Workbook → Note</Text>
    <Text style={styles.note}>{state.explorer.title} · {workbooks.length} {workbooks.length === 1 ? "Workbook" : "Workbooks"} · {notes.length} {notes.length === 1 ? "Note" : "Notes"}</Text>
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
    <Text accessibilityRole="header" style={styles.itemTitle}>Documents and relations</Text>
    {groups.filter(group => group.documents.length).map(group => <View key={group.module}>
      <Text accessibilityRole="header" style={styles.itemTitle}>{group.title} ({group.documents.length})</Text>
      {group.documents.map(document => <View key={document.id} testID={`mobile-project-document-${document.id}`}>
        <Text style={styles.itemMeta}>{document.title} · revision {document.revision}</Text>
        <Text style={styles.note}>{document.editing}{document.archived ? " · archived" : ""}{document.stale ? " · historical dependency" : ""}</Text>
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
    {results.map(result => <Text key={result.id} style={styles.itemMeta}>{result.operation} · {result.authority} · {result.freshness} · {titles.get(result.sourceDocumentId) ?? "Missing source"} revision {result.sourceRevision}</Text>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Source resources ({state.explorer.resources.filter(item => item.available).length}/{state.explorer.resources.length})</Text>
    {state.explorer.resources.map(item => <Text key={`${item.kind}:${item.id}`} style={styles.itemMeta}>{item.kind} · {item.available ? "Verified and retained" : item.required ? "Missing source bytes" : "Optional cache unavailable"}</Text>)}
    <Text style={styles.note}>Import a desktop project package to retain Graph tables, Mesh and Volume source bytes. Package export includes verified retained bytes; missing resources stay missing. Edit an available Graph, Curve or Surface without changing other documents. Other modules remain saved previews; analysis artifact bytes may require separate transfer.</Text>
  </View>;
};
