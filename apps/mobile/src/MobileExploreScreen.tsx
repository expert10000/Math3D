import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
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
    filteredExamples,
    exampleSearchQuery,
    setExampleSearchQuery,
    exampleCategoryFilter,
    setExampleCategoryFilter,
    exampleCapabilityFilter,
    setExampleCapabilityFilter,
    exampleCategories,
    exampleRequiredCapabilities,
    isExampleAvailable,
    openViewerWithExample,
    openLearningExample,
  } = model;
  const learningExamples = mobileExamples.filter((example) => example.learnTopic);
  const [revealedLearnTopics, setRevealedLearnTopics] = useState<string[]>([]);

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
          <TextInput
            testID="mobile-example-search"
            value={exampleSearchQuery}
            onChangeText={setExampleSearchQuery}
            placeholder="Search examples"
            autoCorrect={false}
            style={styles.textInput}
          />
          <Text style={styles.itemMeta}>Category</Text>
          <View style={styles.viewerToolbarRow}>
            {(["all", ...exampleCategories] as const).map((category) => (
              <Pressable
                key={category}
                testID={`mobile-example-category-${category}`}
                onPress={() => setExampleCategoryFilter(category)}
                style={[styles.pill, exampleCategoryFilter === category ? styles.pillActive : null]}
              >
                <Text style={[styles.pillText, exampleCategoryFilter === category ? styles.pillTextActive : null]}>{category === "all" ? "All" : category}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.itemMeta}>Capability</Text>
          <View style={styles.viewerToolbarRow}>
            {(["all", "ready", "offline", ...exampleRequiredCapabilities] as const).map((capability) => (
              <Pressable
                key={capability}
                testID={`mobile-example-capability-${capability}`}
                onPress={() => setExampleCapabilityFilter(capability)}
                style={[styles.pill, exampleCapabilityFilter === capability ? styles.pillActive : null]}
              >
                <Text style={[styles.pillText, exampleCapabilityFilter === capability ? styles.pillTextActive : null]}>
                  {capability === "all" ? "All" : capability === "ready" ? "Ready now" : capability === "offline" ? "Offline" : "Implicit worker"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.itemMeta}>{filteredExamples.length} of {mobileExamples.length} examples</Text>
          {filteredExamples.length === 0 && <Text style={styles.warningNote}>No examples match these filters.</Text>}
          {filteredExamples.map((example) => {
            const surface = example.scene.surfaces?.[0];
            const available = isExampleAvailable(example);
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
                <Text style={available ? styles.itemMeta : styles.warningNote}>
                  {example.capabilities.length === 0 ? "Works offline" : available ? "Worker capability ready" : "Worker capability required"}
                </Text>
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
            <View key={`learn-${example.id}`} testID={`mobile-learn-card-${example.id}`} style={styles.item}>
              <Text style={styles.itemTitle}>{example.learnTopic?.title}</Text>
              <Text style={styles.itemMeta}>{example.learnTopic?.summary}</Text>
              <Text style={styles.note}>Try this</Text>
              <Text style={styles.itemMeta}>{example.learnTopic?.prompt}</Text>
              {revealedLearnTopics.includes(example.id) && (
                <Text testID={`mobile-learn-insight-${example.id}`} style={styles.note}>{example.learnTopic?.insight}</Text>
              )}
              <View style={styles.viewerToolbarRow}>
                <Pressable
                  testID={`mobile-learn-try-${example.id}`}
                  onPress={() => openLearningExample(example)}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Try {example.title}</Text>
                </Pressable>
                <Pressable
                  testID={`mobile-learn-reveal-${example.id}`}
                  onPress={() => setRevealedLearnTopics((current) => current.includes(example.id)
                    ? current.filter((id) => id !== example.id)
                    : [...current, example.id])}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>{revealedLearnTopics.includes(example.id) ? "Hide insight" : "Reveal insight"}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );
};
