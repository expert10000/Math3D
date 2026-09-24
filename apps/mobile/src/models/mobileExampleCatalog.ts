import type { WorkerCapabilityId } from "@math3d/core";
import type { Math3DExample, Math3DExampleCategory } from "./mobileScene";

export type MobileExampleCategoryFilter = "all" | Math3DExampleCategory;
export type MobileExampleCapabilityFilter = "all" | "ready" | "offline" | WorkerCapabilityId;

export type MobileExampleFilterOptions = {
  query: string;
  category: MobileExampleCategoryFilter;
  capability: MobileExampleCapabilityFilter;
  availableCapabilities: readonly WorkerCapabilityId[];
};

export const mobileExampleIsAvailable = (
  example: Math3DExample,
  availableCapabilities: readonly WorkerCapabilityId[]
): boolean => example.capabilities.every((capability) => availableCapabilities.includes(capability));

export const filterMobileExamples = (
  examples: readonly Math3DExample[],
  options: MobileExampleFilterOptions
): Math3DExample[] => {
  const query = options.query.trim().toLocaleLowerCase();
  return examples.filter((example) => {
    if (options.category !== "all" && example.category !== options.category) return false;
    if (options.capability === "ready" && !mobileExampleIsAvailable(example, options.availableCapabilities)) return false;
    if (options.capability === "offline" && example.capabilities.length > 0) return false;
    if (
      options.capability !== "all" &&
      options.capability !== "ready" &&
      options.capability !== "offline" &&
      !example.capabilities.includes(options.capability)
    ) return false;
    if (!query) return true;
    const searchable = [
      example.title,
      example.description,
      example.category,
      example.surfaceType,
      example.learnTopic?.title ?? "",
      example.learnTopic?.summary ?? "",
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });
};

export const mobileExampleCategories = (examples: readonly Math3DExample[]): Math3DExampleCategory[] =>
  [...new Set(examples.map((example) => example.category))].sort((a, b) => a.localeCompare(b));

export const mobileExampleRequiredCapabilities = (examples: readonly Math3DExample[]): WorkerCapabilityId[] =>
  [...new Set(examples.flatMap((example) => example.capabilities))].sort((a, b) => a.localeCompare(b));
