import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { styles } from "../mobileAppStyles";
import { buildMobileProjectExplorer } from "../models/mobileProjectExplorer";

export const MobileProjectExplorer: React.FC<{ raw: string }> = ({ raw }) => {
  const state = useMemo(() => {
    try { return { explorer: buildMobileProjectExplorer(raw), error: null }; }
    catch (error) { return { explorer: null, error: (error as Error).message }; }
  }, [raw]);
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
    {results.map(result => <Text key={result.id} style={styles.itemMeta}>{result.operation} · {result.authority} · {result.freshness} · source revision {result.sourceRevision}</Text>)}
    <Text style={styles.note}>Saved previews retain their sources. Open the project to use its supported Graph workspace; companion editors are not enabled here.</Text>
  </View>;
};
