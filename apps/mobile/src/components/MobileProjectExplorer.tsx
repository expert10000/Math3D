import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { styles } from "../mobileAppStyles";
import { buildMobileProjectExplorer } from "../models/mobileProjectExplorer";
import type { ProjectResourceSidecar } from "@math3d/core";

export const MobileProjectExplorer: React.FC<{ raw: string; resources?: readonly ProjectResourceSidecar[] }> = ({ raw, resources }) => {
  const state = useMemo(() => {
    try { return { explorer: buildMobileProjectExplorer(raw, resources), error: null }; }
    catch (error) { return { explorer: null, error: (error as Error).message }; }
  }, [raw, resources]);
  if (!state.explorer) return <Text accessibilityRole="alert" style={styles.note}>{state.error}</Text>;
  const { groups, relations, results } = state.explorer;
  const titles = new Map(groups.flatMap(group => group.documents.map(document => [document.id, document.title] as const)));
  return <View testID="mobile-project-document-explorer" style={styles.projectEditor}>
    <Text accessibilityRole="header" style={styles.itemTitle}>Documents and relations</Text>
    {groups.filter(group => group.documents.length).map(group => <View key={group.module}>
      <Text accessibilityRole="header" style={styles.itemTitle}>{group.title} ({group.documents.length})</Text>
      {group.documents.map(document => <View key={document.id} testID={`mobile-project-document-${document.id}`}>
        <Text style={styles.itemMeta}>{document.title} · revision {document.revision}</Text>
        <Text style={styles.note}>{document.editing}{document.archived ? " · archived" : ""}{document.stale ? " · historical dependency" : ""}</Text>
      </View>)}
    </View>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Relations ({relations.length})</Text>
    {relations.map(relation => <View key={relation.relationId}>
      <Text style={styles.itemMeta}>{relation.sources.map(source => titles.get(source.documentId) ?? "Missing source").join(" + ")} → {relation.target.type === "document" ? titles.get(relation.target.generation.documentId) ?? "Missing document" : relation.target.type === "result" ? "Analysis" : "Artifact"}</Text>
      <Text style={styles.note}>{relation.operation} · {relation.freshness}</Text>
    </View>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Analysis ({results.length})</Text>
    {results.map(result => <Text key={result.id} style={styles.itemMeta}>{result.operation} · {result.authority} · {result.freshness} · {titles.get(result.sourceDocumentId) ?? "Missing source"} revision {result.sourceRevision}</Text>)}
    <Text accessibilityRole="header" style={styles.itemTitle}>Source resources ({state.explorer.resources.filter(item => item.available).length}/{state.explorer.resources.length})</Text>
    {state.explorer.resources.map(item => <Text key={`${item.kind}:${item.id}`} style={styles.itemMeta}>{item.kind} · {item.available ? "Verified and retained" : item.required ? "Missing source bytes" : "Optional cache unavailable"}</Text>)}
    <Text style={styles.note}>Import a desktop project package to retain Graph tables, Mesh and Volume source bytes. Package export includes verified retained bytes; missing resources stay missing. Analysis artifact bytes may require separate transfer. Editors are available only for the supported single-Graph project format.</Text>
  </View>;
};
