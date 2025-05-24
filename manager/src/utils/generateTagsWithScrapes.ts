// danbooruDbPopulation.ts
import fs from "node:fs/promises";
import db from "@/db"; // Your Drizzle DB connection
import { categories, tags, categoryTag } from "@/schema"; // Import all tables

// Input file: Combined structure with tags (Output from Script 2)
const TAG_GROUPS_WITH_TAGS_FILE = "../danbooru_tag_groups_with_tags.json";

// Interface for the structure loaded from the combined JSON file
// Adjusted based on your likely actual output structure
interface ScrapedGroupNode {
  name: string;
  level: number;
  url?: string; // URL from the main page if this node came from a link
  subgroups?: ScrapedGroupNode[]; // Nested nodes (either links from main page, or headings/tags from detail pages)
  tags?: string[]; // Actual tags found under this heading/group on a detail page
}

// --- Helper function to get tag ID map ---
async function getTagTextToIdMap(): Promise<Map<string, number>> {
  const allTags = await db.select({ id: tags.id, tagText: tags.tagText }).from(tags);
  return new Map(allTags.map((tag) => [tag.tagText, tag.id]));
}

// --- Recursive function to process scraped nodes and populate DB ---
async function processScrapedNode(
  node: ScrapedGroupNode,
  parentCategoryId: number | null,
  tagTextToIdMap: Map<string, number>,
): Promise<number | null> {
  // Decide category properties based on the scraped node
  const isGroup = node.subgroups !== undefined && node.subgroups.length > 0;
  const hasTags = node.tags !== undefined && node.tags.length > 0; // Node directly contains tags

  // Skip nodes that are just placeholders without content we map (e.g., Characters/More with no subgroups/tags)
  if (!isGroup && !hasTags) {
    console.log(
      `Skipping scraped node "${node.name}" (Level ${node.level}) - No subgroups or tags.`,
    );
    return null; // Don't create a category for this node
  }

  // Decide on a default selection rule. These will likely need manual adjustment later.
  let defaultSelectionRule: (typeof categories.selectionRule.enumValues)[number] = "group_only"; // Default for groups

  if (!isGroup && hasTags) {
    // This is a leaf node in the scraped structure (contains tags).
    // Default rule for picking from the tag pool. 'pick_multiple' is common.
    defaultSelectionRule = "pick_multiple";
  } else if (isGroup && node.url) {
    // This group came from a link on the main page (like Tag group:Artistic license)
    // It represents a distinct concept group. How do we select from these?
    // If the parent is pick_one, children need a rule. If parent is pick_multiple, maybe pick_one here?
    // This gets complex; a simple default might be needed. Let's stick to group_only for groups.
  }

  // --- Insert the category into the database ---
  console.log(`Inserting category "${node.name}" (Level ${node.level}, isGroup: ${isGroup})...`);
  let insertedCategory: { id: number };
  try {
    const insertResult = await db
      .insert(categories)
      .values({
        name: node.name,
        parentId: parentCategoryId,
        level: node.level, // Use scraped level
        selectionRule: defaultSelectionRule, // Assign default rule
        isGroup: isGroup, // Set group status
        promptTemplatePart: null, // Leave null for manual assignment
      })
      .returning({ id: categories.id });
    insertedCategory = insertResult[0]; // Get the new category ID
    console.log(`Inserted category "${node.name}" with ID: ${insertedCategory.id}`);
  } catch (error) {
    console.error(`Failed to insert category "${node.name}":`, error);
    return null; // Stop processing this branch on error
  }

  if (!insertedCategory) {
    console.error(`Failed to get ID for inserted category "${node.name}".`);
    return null;
  }

  const currentCategoryId = insertedCategory.id;

  // --- If this node has tags directly, link them to the created category (as a Leaf Category) ---
  // This assumes nodes with 'tags' array in the scraped data are intended to be our DB Leaf categories.
  // Based on the analysis, this seems to be nodes *within* the detail page content like "Colors", "Patterns".
  if (!isGroup && hasTags && node.tags) {
    // Check hasTags explicitly and that the array exists
    const linksToInsert = node.tags
      .map((tagName) => {
        const tagId = tagTextToIdMap.get(tagName);
        if (tagId === undefined) {
          // This tag wasn't found in our tags table (maybe filtered out by frequency?)
          console.warn(
            `Tag "${tagName}" found in scraped group "${node.name}" but not in the database tags table. Skipping link.`,
          );
          return null; // Skip linking this tag
        }
        return { categoryId: currentCategoryId, tagId: tagId };
      })
      .filter(Boolean) as { categoryId: number; tagId: number }[]; // Filter out nulls

    if (linksToInsert.length > 0) {
      console.log(
        `Linking ${linksToInsert.length} tags to category "${node.name}" (ID: ${currentCategoryId})...`,
      );
      // Batch insert links if necessary
      const batchSize = 500;
      for (let i = 0; i < linksToInsert.length; i += batchSize) {
        const batch = linksToInsert.slice(i, i + batchSize);
        if (batch.length > 0) {
          try {
            await db.insert(categoryTag).values(batch);
          } catch (error) {
            console.error(
              `Failed to insert categoryTag batch for category ${currentCategoryId}:`,
              error,
            );
            // Decide whether to throw or continue on batch error
          }
        }
      }
      console.log(`Linked tags for category "${node.name}".`);
    } else {
      console.log(`No valid tags found in DB to link for category "${node.name}".`);
    }
  }

  // --- If this node has subgroups, recursively process them ---
  if (isGroup && node.subgroups) {
    // Check isGroup explicitly
    console.log(
      `Processing ${node.subgroups.length} subgroups for "${node.name}" (ID: ${currentCategoryId})...`,
    );
    for (const subnode of node.subgroups) {
      // Recursively call for each subgroup, passing the current node's ID as the parent
      await processScrapedNode(subnode, currentCategoryId, tagTextToIdMap);
    }
    console.log(`Finished processing subgroups for "${node.name}".`);
  }

  return currentCategoryId; // Return the ID of the category that was created for this node
}

// --- Main Population Script ---
async function populateDbFromScrapedData() {
  console.log("Starting database population from scraped data...");

  // 1. Load the combined scraped data (output from Script 2)
  let scrapedData: ScrapedGroupNode[];
  try {
    const rawData = await fs.readFile(TAG_GROUPS_WITH_TAGS_FILE, "utf-8");
    scrapedData = JSON.parse(rawData);
    console.log(`Loaded ${scrapedData.length} top-level nodes from ${TAG_GROUPS_WITH_TAGS_FILE}.`);
  } catch (error) {
    console.error("Failed to load scraped data file:", error);
    console.warn(
      "Ensure you have run danbooruTagGroupsScraper.ts and danbooruDetailPageScraper.ts first.",
    );
    return;
  }

  // 2. Fetch the Tag Text to ID map from the DB
  // Ensure your tags table is already populated from the API data (Phase 1, Step 5)
  console.log("Fetching tag text to ID map from database...");
  const tagTextToIdMap = await getTagTextToIdMap();
  console.log(`Fetched map for ${tagTextToIdMap.size} tags.`);
  if (tagTextToIdMap.size === 0) {
    console.error(
      "Tags table is empty. Please run the tag and correlation analysis and save script first.",
    );
    return;
  }

  // 3. Process the top-level nodes from the scraped data
  // These nodes are the starting points of the wiki's hierarchy (like "Intro", "Visual characteristics").
  console.log("Processing scraped structure...");
  for (const topNode of scrapedData) {
    // Filter out top-level nodes you don't want in your main prompt structure if needed
    // e.g., if (topNode.name === "Intro" || topNode.name === "Metatags") continue;

    // Start the recursive process for each top-level node
    // parentCategoryId is null for top-level nodes.
    await processScrapedNode(topNode, null, tagTextToIdMap);
  }

  console.log("Database population from scraped data finished.");
}

// --- Run the population ---
// Ensure your database connection is configured and tags table is populated before running this
populateDbFromScrapedData().catch(console.error);

// --- You might also need to manually add or update categories after this script runs ---
// - Assign `promptTemplatePart` values to L1/L2 groups ([POSITION], [ATTIRE] etc.)
// - Adjust `selectionRule`s on group categories to match your desired prompt logic (pick_one, pick_multiple)
// - Add `relationshipWeights` if you want manual biases between categories and tags
// - Manually link any important tags not found in the wiki groups to relevant categories
