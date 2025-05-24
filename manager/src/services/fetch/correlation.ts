// src/services/CorrelationService.ts
import db from "@/db"; // Adjust path
import { scrapedPosts } from "@/schema/scrapedPosts"; // Adjust path
import { tags } from "@/schema";
import type { InsertTag } from "@/schema";
import { relationshipWeights } from "@/schema/relationshipWeights"; // Adjust path and ensure InsertRelationshipWeight is exported
import type { InsertRelationshipWeight } from "@/schema"; // Corrected type import name
import { eq, max, desc, sql } from "drizzle-orm"; // Drizzle operators
import { normalizeTag } from "@/utils/tags"; // Import normalization utility // !! Adjust path !!

// Define constants for analysis
const MIN_TAG_FREQUENCY = 10; // Only consider tags that appear at least this many times
const MIN_CO_OCCURRENCE_FREQUENCY = 5; // Only consider pairs that appear together at least this many times
const MIN_PMI = 0; // Only store positive PMI (or adjust as needed)
const TAG_INSERT_BATCH_SIZE = 500; // Batch size for inserting new tags

// Helper to get tag IDs from the database for a list of normalized tag texts
// This assumes the `tags` table stores normalized tag texts.
async function getTagIds(normalizedTagTexts: string[]): Promise<Map<string, number>> {
  if (normalizedTagTexts.length === 0) {
    return new Map();
  }
  try {
    // Ensure lookup values are safe for SQL IN clause
    // This approach is safe for SQLite as long as normalizedTagTexts don't contain backticks or comments that could break out
    const safeTagTexts = normalizedTagTexts.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");

    // Select IDs for the given tag texts
    const tagRecords = await db
      .select({ id: tags.id, tagText: tags.tagText })
      .from(tags)
      .where(sql`${tags.tagText} IN (${sql.raw(safeTagTexts)})`); // Use sql.raw for the list of quoted strings

    const tagIdMap = new Map<string, number>();
    for (const record of tagRecords) {
      tagIdMap.set(record.tagText, record.id);
    }
    return tagIdMap;
  } catch (error) {
    console.error("Failed to get tag IDs:", error);
    // Re-throw or handle appropriately
    throw error;
  }
}

const CorrelationService = {
  /**
   * Calculates and stores tag relationships (PMI) based on co-occurrence in scraped posts.
   * This function should be run periodically after acquiring new posts.
   * It also ensures that all frequent tags found in posts are present in the `tags` table.
   */
  async calculateAndStoreTagRelationships() {
    console.log("Starting tag relationship calculation...");

    let totalPosts = 0;
    const individualTagCounts = new Map<string, number>(); // Stores counts using normalized tag text
    // Use nested map for co-occurrence: Map<normalized_tag1, Map<normalized_tag2, count>>
    const coOccurrenceCounts = new Map<string, Map<string, number>>();

    try {
      // Stream or paginate if you have many posts to avoid loading all into memory
      console.log("Fetching all scraped posts...");
      // Fetch only the tag string column
      const allPosts = await db
        .select({ tagString: scrapedPosts.tagStringGeneral })
        .from(scrapedPosts);
      console.log(`Fetched ${allPosts.length} posts for analysis.`);

      totalPosts = allPosts.length;

      if (totalPosts === 0) {
        console.log("No posts found in DB. Skipping correlation calculation.");
        return;
      }

      console.log("Aggregating tag counts and co-occurrence counts...");
      for (const post of allPosts) {
        if (!post.tagString) continue; // Skip posts with no tags

        // Tags from tag_string_general are already normalized (lowercase, underscores)
        const normalizedTagsInPost = post.tagString
          .split(" ") // Assuming space separated
          .filter((tag) => tag.length > 0); // Filter out empty strings from multiple spaces

        if (normalizedTagsInPost.length === 0) continue; // Skip if splitting resulted in no tags

        // Sort tags alphabetically for consistent pair keying (e.g., ["a", "b"] vs ["b", "a"])
        normalizedTagsInPost.sort();

        // Count individual tags (using the already normalized tag text)
        for (const tag of normalizedTagsInPost) {
          individualTagCounts.set(tag, (individualTagCounts.get(tag) || 0) + 1);
        }

        // Count co-occurrences for pairs (using the already normalized tag text)
        // Iterate through all unique pairs of tags in the post
        for (let i = 0; i < normalizedTagsInPost.length; i++) {
          for (let j = i + 1; j < normalizedTagsInPost.length; j++) {
            const tag1 = normalizedTagsInPost[i];
            const tag2 = normalizedTagsInPost[j];

            // Use consistent key ordering for the co-occurrence map
            const pairKey1 = tag1 < tag2 ? tag1 : tag2;
            const pairKey2 = tag1 < tag2 ? tag2 : tag1;

            if (!coOccurrenceCounts.has(pairKey1)) {
              coOccurrenceCounts.set(pairKey1, new Map<string, number>());
            }
            const innerMap = coOccurrenceCounts.get(pairKey1);
            if (innerMap === undefined) {
              // Should not happen with the check above, but defensive
              continue;
            }
            innerMap.set(pairKey2, (innerMap.get(pairKey2) || 0) + 1);
          }
        }
      }

      console.log(`Found ${individualTagCounts.size} unique tags in posts.`);

      // --- Identify and Insert Missing Tags into the `tags` table ---
      // Get all unique tag texts that meet the minimum frequency threshold
      const frequentTagTexts = Array.from(individualTagCounts.keys()).filter(
        (tagText) => individualTagCounts.get(tagText)! >= MIN_TAG_FREQUENCY,
      );

      console.log(
        `Found ${frequentTagTexts.length} tags meeting minimum frequency (${MIN_TAG_FREQUENCY}).`,
      );

      if (frequentTagTexts.length === 0) {
        console.log("No frequent tags found. Skipping relationship calculation.");
        return;
      }

      console.log("Ensuring all frequent tags exist in the `tags` table...");
      const existingTagIdMap = await getTagIds(frequentTagTexts);
      const tagsToInsert: InsertTag[] = [];

      for (const tagText of frequentTagTexts) {
        // If the tag text is NOT in our map of existing tags, it needs to be inserted
        if (!existingTagIdMap.has(tagText)) {
          tagsToInsert.push({ tagText: tagText });
        }
      }

      if (tagsToInsert.length > 0) {
        console.log(`Inserting ${tagsToInsert.length} new frequent tags into the 'tags' table...`);
        await db.transaction(async (tx) => {
          for (let k = 0; k < tagsToInsert.length; k += TAG_INSERT_BATCH_SIZE) {
            const batch = tagsToInsert.slice(k, k + TAG_INSERT_BATCH_SIZE);
            if (batch.length === 0) continue;
            try {
              await tx.insert(tags).values(batch).onConflictDoNothing({ target: tags.tagText }); // Use tagText as unique target
              console.log(
                `Inserted batch ${k / TAG_INSERT_BATCH_SIZE + 1} of ${Math.ceil(tagsToInsert.length / TAG_INSERT_BATCH_SIZE)}`,
              );
            } catch (error) {
              console.error(
                `Error inserting new tag batch ${k / TAG_INSERT_BATCH_SIZE + 1}:`,
                error,
              );
              throw error; // Rollback transaction
            }
          }
        });
        console.log("Finished inserting new tags.");
      } else {
        console.log("All frequent tags already exist in the `tags` table.");
      }

      // Refresh the tag ID map to include any newly inserted tags
      const finalTagIdMap = await getTagIds(frequentTagTexts);
      console.log(`Refreshed tag ID map with ${finalTagIdMap.size} IDs.`);

      // --- Calculate PMI and Prepare for DB Insert ---
      const relationshipsToProcess: { tag1: string; tag2: string; weight: number }[] = [];

      console.log("Calculating PMI and filtering relationships...");
      // Iterate through co-occurrence counts, but ONLY for tags that passed the frequency filter
      for (const [tag1, innerMap] of coOccurrenceCounts.entries()) {
        // Ensure tag1 is frequent and has an ID
        const count1 = individualTagCounts.get(tag1) || 0;
        if (count1 < MIN_TAG_FREQUENCY || !finalTagIdMap.has(tag1)) continue; // Skip if not frequent or no ID

        for (const [tag2, coOccurrenceCount] of innerMap.entries()) {
          // Ensure tag2 is also frequent and has an ID
          const count2 = individualTagCounts.get(tag2) || 0;
          if (count2 < MIN_TAG_FREQUENCY || !finalTagIdMap.has(tag2)) continue; // Skip if not frequent or no ID

          // Only consider pairs meeting minimum co-occurrence frequency
          if (coOccurrenceCount < MIN_CO_OCCURRENCE_FREQUENCY) continue;

          // Calculate PMI (formula assumes tag counts and co-occurrence count are based on totalPosts)
          // PMI = log2( (coOccurrenceCount * totalPosts) / (count1 * count2) )

          // Avoid division by zero - checks above should prevent this if totalPosts > 0
          if (count1 > 0 && count2 > 0 && totalPosts > 0) {
            const pmi = Math.log2((coOccurrenceCount * totalPosts) / (count1 * count2));

            // Only store relationships meeting the minimum PMI threshold
            if (pmi >= MIN_PMI) {
              relationshipsToProcess.push({ tag1: tag1, tag2: tag2, weight: pmi });
            }
          } else {
            console.warn(
              `Skipping PMI calculation for pair (${tag1}, ${tag2}) due to zero counts.`,
            );
          }
        }
      }

      console.log(`Identified ${relationshipsToProcess.length} relationships meeting thresholds.`);

      // Map tag texts to IDs using the final map
      const relationshipsArrayForDb: InsertRelationshipWeight[] = [];

      for (const rel of relationshipsToProcess) {
        const sourceId = finalTagIdMap.get(rel.tag1);
        const targetId = finalTagIdMap.get(rel.tag2);

        // This check should ideally not be needed now, but kept for robustness
        if (sourceId === undefined || targetId === undefined) {
          console.warn(
            `Logic error: Could not find IDs for tags involved in relationship (${rel.tag1}, ${rel.tag2}) even after insert check. Skipping this relationship.`,
          );
          continue;
        }

        // For bi-directional relationships, create two entries unless source and target are the same tag
        relationshipsArrayForDb.push({
          sourceTagId: sourceId,
          targetTagId: targetId,
          weight: rel.weight,
        });
        if (sourceId !== targetId) {
          // Avoid duplicate (X, X) relationship
          relationshipsArrayForDb.push({
            sourceTagId: targetId,
            targetTagId: sourceId,
            weight: rel.weight,
          }); // Reversed direction
        }
      }

      // Use a Map to filter out exact duplicate relationship objects.
      // This handles cases where A-B and B-A might both be generated for the same weight,
      // ensuring we don't try to insert exact duplicates in the batch.
      // Note: onConflictDoUpdate handles logical duplicates (same source/target pair) but
      // this map filters out identical objects before the batching.
      const uniqueRelationshipsMap = new Map<string, InsertRelationshipWeight>();
      for (const rel of relationshipsArrayForDb) {
        // Key is sourceId-targetId. Since we insert both directions,
        // this map will contain both A-B and B-A if they were generated.
        const key = `${rel.sourceTagId}-${rel.targetTagId}`;
        uniqueRelationshipsMap.set(key, rel);
      }

      const relationshipsArrayForDbUnique = Array.from(uniqueRelationshipsMap.values());

      console.log(
        `Prepared ${relationshipsArrayForDbUnique.length} unique bi-directional relationships for insertion/update.`,
      );

      // --- Insert/Update Relationships in DB ---
      console.log("Storing relationships in DB...");
      // Use a transaction for bulk inserts
      const relationshipInsertBatchSize = 500; // Batch size for relationship inserts
      await db.transaction(async (tx) => {
        for (
          let k = 0;
          k < relationshipsArrayForDbUnique.length;
          k += relationshipInsertBatchSize
        ) {
          const batch = relationshipsArrayForDbUnique.slice(k, k + relationshipInsertBatchSize);
          if (batch.length === 0) continue;

          // --- ADD LOGGING HERE ---
          console.log(
            `--- Batch ${k / relationshipInsertBatchSize + 1} (first 5 relationships): ---`,
          );
          console.log(batch.slice(0, 5)); // Log the first few items to inspect
          console.log(`--- End of Batch ${k / relationshipInsertBatchSize + 1} preview ---`);
          // -------------------------

          try {
            // Use onConflictDoUpdate to update the weight if the relationship already exists
            // Specify columns to update: just 'weight'
            await tx
              .insert(relationshipWeights)
              .values(batch)
              // Conflict target is the composite primary key [sourceTagId, targetTagId]
              .onConflictDoUpdate({
                target: [relationshipWeights.sourceTagId, relationshipWeights.targetTagId],
                set: {
                  weight: sql`excluded.weight`, // Update weight with the new value
                  // storedAt: sql`CURRENT_TIMESTAMP` // Optional: update timestamp if you add one to the table
                },
              });
            console.log(
              `Inserted/Updated relationship batch ${k / relationshipInsertBatchSize + 1} of ${Math.ceil(relationshipsArrayForDbUnique.length / relationshipInsertBatchSize)}`,
            );
          } catch (error) {
            console.error(
              `Error inserting/updating relationship batch ${k / relationshipInsertBatchSize + 1}:`,
              error,
            );
            // Depending on error, tx.rollback() might be automatic or needed
            throw error; // Re-throw to rollback the transaction
          }
        }
      });

      console.log("Tag relationship calculation and storage complete.");
    } catch (error) {
      console.error("An error occurred during tag relationship analysis:", error);
      throw error; // Allow caller to handle the error
    }
  },

  // Keep existing getRelatedTags method as it should now work with normalized tags
  async getRelatedTags(
    tagText: string,
    limit = 10,
  ): Promise<{ tagText: string; weight: number }[]> {
    console.log(`Finding tags related to "${tagText}"`);
    // Normalize the input tag text for lookup
    const normalizedTagText = normalizeTag(tagText);

    if (!normalizedTagText) {
      console.log(`Input tag "${tagText}" normalized to empty. Cannot find related tags.`);
      return [];
    }

    try {
      // Get the ID of the source tag (using the normalized text)
      const sourceTag = await db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.tagText, normalizedTagText))
        .limit(1);

      if (sourceTag.length === 0) {
        console.log(`Tag "${normalizedTagText}" ("${tagText}") not found in database.`);
        return [];
      }

      const sourceTagId = sourceTag[0].id;

      // Query relationshipWeights for this sourceTagId, join with tags table to get target tag text
      const relatedTags = await db
        .select({
          tagText: tags.tagText,
          weight: relationshipWeights.weight,
        })
        .from(relationshipWeights)
        .innerJoin(tags, eq(relationshipWeights.targetTagId, tags.id))
        .where(eq(relationshipWeights.sourceTagId, sourceTagId))
        .orderBy(desc(relationshipWeights.weight)) // Order by weight (descending)
        .limit(limit); // Limit the number of results

      console.log(`Found ${relatedTags.length} related tags for "${normalizedTagText}".`);
      return relatedTags;
    } catch (error) {
      console.error(`Failed to get related tags for "${normalizedTagText}":`, error);
      throw error;
    }
  },
};

export default CorrelationService;
