import fs from "node:fs/promises";
import path from "node:path";

// Example: Calculating counts from acquired data
export async function calculateCounts(dataDir: string) {
  const individualTagCounts: Map<string, number> = new Map();
  const coOccurrenceCounts: Map<string, Map<string, number>> = new Map(); // Map<tag1, Map<tag2, count>>

  const files = await fs.readdir(dataDir);
  const postFiles = files.filter((file) => file.endsWith(".json"));

  const BANNED_TAGS = new Set([""]); // Add tags to exclude
  const ALLOWED_TAG_TYPES = new Set(["general"]); // Add types you want (check Danbooru API for types)

  // Optional: Fetch tag types if needed for filtering
  // const tagTypes = await fetchDanbooruTagTypes(); // Implement this function

  let totalPostsProcessed = 0;

  for (const file of postFiles) {
    const filePath = path.join(dataDir, file);
    const posts: any[] = JSON.parse(await fs.readFile(filePath, "utf-8"));

    for (const post of posts) {
      totalPostsProcessed++;
      // Assuming 'tag_string' contains all tags as a single space-separated string
      // Or fetch full tag objects with types if needed
      const rawTags = post.tag_string.split(" ");

      // Filter tags
      const filteredTags = rawTags.filter((tag: string) => {
        // Basic checks: not banned, maybe check type later if you fetched types
        if (BANNED_TAGS.has(tag)) return false;
        // Example type check (requires fetching tag details separately or having a local mapping)
        // const tagDetail = tagTypes.get(tag);
        // if (tagDetail && !ALLOWED_TAG_TYPES.has(tagDetail.category)) return false;
        return true; // Keep the tag
      });

      // Count individual tags
      for (const tag of filteredTags) {
        individualTagCounts.set(tag, (individualTagCounts.get(tag) || 0) + 1);
      }

      // Count co-occurrences for pairs within the filtered tags
      for (let i = 0; i < filteredTags.length; i++) {
        for (let j = i + 1; j < filteredTags.length; j++) {
          const tag1 = filteredTags[i];
          const tag2 = filteredTags[j];

          // Ensure consistent ordering
          const [sortedTag1, sortedTag2] = [tag1, tag2].sort();

          if (!coOccurrenceCounts.has(sortedTag1)) {
            coOccurrenceCounts.set(sortedTag1, new Map());
          }
          const innerMap = coOccurrenceCounts.get(sortedTag1)!;
          innerMap.set(sortedTag2, (innerMap.get(sortedTag2) || 0) + 1);
        }
      }
    }
  }

  console.log(`Processed ${totalPostsProcessed} posts.`);
  console.log(`Found ${individualTagCounts.size} unique filtered tags.`);
  // console.log(`Found ${[...coOccurrenceCounts.values()].reduce((sum, map) => sum + map.size, 0)} unique tag pairs.`);

  // Optional: Filter out low-frequency tags before calculating correlations
  const MIN_TAG_FREQUENCY = 100; // Example threshold
  const frequentTags = new Set(
    [...individualTagCounts.keys()].filter(
      (tag) => individualTagCounts.get(tag)! >= MIN_TAG_FREQUENCY,
    ),
  );
  console.log(`Keeping ${frequentTags.size} tags with frequency >= ${MIN_TAG_FREQUENCY}`);

  // Now, process counts to only include frequent tags
  const filteredCoOccurrenceCounts: Map<string, Map<string, number>> = new Map();
  const filteredIndividualTagCounts: Map<string, number> = new Map();

  for (const [tag, count] of individualTagCounts.entries()) {
    if (frequentTags.has(tag)) {
      filteredIndividualTagCounts.set(tag, count);
    }
  }

  for (const [tag1, innerMap] of coOccurrenceCounts.entries()) {
    if (frequentTags.has(tag1)) {
      const filteredInnerMap = new Map();
      for (const [tag2, count] of innerMap.entries()) {
        if (frequentTags.has(tag2)) {
          filteredInnerMap.set(tag2, count);
        }
      }
      if (filteredInnerMap.size > 0) {
        filteredCoOccurrenceCounts.set(tag1, filteredInnerMap);
      }
    }
  }

  return {
    individualTagCounts: filteredIndividualTagCounts,
    coOccurrenceCounts: filteredCoOccurrenceCounts,
    totalPosts: totalPostsProcessed,
  };
}

// src/utils/tagNormalization.ts

/**
 * Normalizes a tag string to a consistent format (lowercase, spaces to underscores).
 * This helps match tags found in API responses (tag_string_general) with tags
 * stored from the wiki hierarchy.
 * @param tag - The raw tag string (e.g., from wiki or API).
 * @returns The normalized tag string.
 */
export function normalizeTag(tag: string | null | undefined): string {
  if (!tag) {
    return ""; // Handle null, undefined, or empty string input
  }
  // 1. Trim leading/trailing whitespace
  let normalized = tag.trim();
  // 2. Convert to lowercase
  normalized = normalized.toLowerCase();
  // 3. Replace spaces with underscores
  normalized = normalized.replace(/ /g, "_");
  // Add any other specific replacements if needed based on observed Danbooru tags
  // For now, space -> underscore and lowercase should cover most common issues.
  // Example: removing parentheses if they cause issues? (though API usually keeps them)
  // normalized = normalized.replace(/[()]/g, '');

  return normalized;
}

// calculateCounts("../danbooru_data").catch(console.error); // Run this after acquiring data
