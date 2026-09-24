import React from "react";
import { Pressable, Text, View } from "react-native";
import { mobileExamples } from "./data/mobileSeedData";
import { surfaceSummary, type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

export const MobileExploreScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const {
    tab,
    exploreSection,
    setExploreSection,
    selectedExampleId,
    setSelectedExampleId,
    selectedExample,
    openViewerWithExample,
  } = model;
  const learningExamples = mobileExamples.filter((example) => example.learnTopic);

  return (
    <>
      {tab === "explore" && (
        <View style={styles.exploreNav}>
          {(["examples", "learn"] as const).map((section) => (
            <Pressable
              key={section}
              testID={`mobile-explore-${section}`}
              onPress={() => setExploreSection(section)}
              style={[styles.exploreNavBtn, exploreSection === section ? styles.exploreNavBtnActive : null]}
            >
              <Text style={[styles.exploreNavText, exploreSection === section ? styles.exploreNavTextActive : null]}>
                {section === "examples" ? "Examples" : "Learn"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {tab === "explore" && exploreSection === "examples" && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Examples</Text>
          <Text style={styles.note}>One catalog supplies graphs, parametric surfaces, implicit jobs, and learning links.</Text>
          {mobileExamples.map((example) => {
            const surface = example.scene.surfaces?.[0];
            return (
              <Pressable
                key={example.id}
                testID={`mobile-example-${example.id}`}
                onPress={() => {
                  setSelectedExampleId(example.id);
                  openViewerWithExample(example);
                }}
                style={[styles.item, selectedExampleId === example.id ? styles.itemActive : null]}
              >
                <Text style={styles.itemTitle}>{example.title}</Text>
                <Text style={styles.itemMeta}>{example.description}</Text>
                <Text style={styles.itemMeta}>{example.category} · {example.surfaceType}</Text>
                {surface ? <Text style={styles.itemMeta}>{surfaceSummary(surface)}</Text> : null}
              </Pressable>
            );
          })}

          {selectedExample && (
            <Pressable onPress={() => openViewerWithExample(selectedExample)} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Open in Workspace ({selectedExample.title})</Text>
            </Pressable>
          )}
        </View>
      )}

      {tab === "explore" && exploreSection === "learn" && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Learn with examples</Text>
          <Text style={styles.note}>Each topic opens the same scene used by the Examples catalog.</Text>
          {learningExamples.map((example) => (
            <View key={`learn-${example.id}`} style={styles.item}>
              <Text style={styles.itemTitle}>{example.learnTopic?.title}</Text>
              <Text style={styles.itemMeta}>{example.learnTopic?.summary}</Text>
              <Pressable onPress={() => openViewerWithExample(example)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Open {example.title}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </>
  );
};
