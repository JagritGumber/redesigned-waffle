// src/services/training/prepareTrainingData.ts
import db from "@/db";
import { scrapedPosts } from "@/schema/scrapedPosts";
import { tags } from "@/schema/tags";
import { normalizeTag } from "@/utils/tags"; // Your normalizeTag utility
import { sql, gt, asc, desc, inArray } from "drizzle-orm"; // Import gt, asc, desc, inArray for querying

// Configuration for data preparation
const MIN_TAG_FREQUENCY_FOR_VOCAB = 50; // Tags must appear this many times to be in the vocabulary and training
const NEGATIVE_SAMPLING_RATIO = 5; // Number of negative samples per positive sample
const BATCH_SIZE_DB_FETCH = 1000; // Fetch posts from DB in batches
// We will reserve model index 0 for padding/unknown tokens

interface TrainingDataArrays {
  sourceModelIndices: number[]; // Array of source tag MODEL INDICES for positive/negative pairs
  contextModelIndices: number[]; // Array of context tag MODEL INDICES for positive/negative pairs
  labels: number[]; // Array of labels (1 for positive, 0 for negative)
}

interface VocabularyData {
  vocabularySize: number; // Total number of unique tags in the vocabulary (including padding if used)
  tagIdToText: Map<number, string>; // Mapping from DB ID to tag text (only for frequent tags)
  tagTextToId: Map<string, number>; // Mapping from tag text to DB ID (only for frequent tags)
  dbIdToModelIndex: Map<number, number>; // Mapping from DB ID to MODEL INDEX (for frequent tags)
  modelIndexToDbId: Map<number, number>; // Mapping from MODEL INDEX to DB ID
}

interface PreparedDataArraysAndId extends TrainingDataArrays {
  lastProcessedPostId: number; // Highest post ID processed in this batch/run
}

/**
 * Prepares training data (positive and negative tag pairs) from a batch of posts,
 * converting DB IDs to model indices.
 * Assumes vocabulary maps are provided.
 * @param posts - Array of posts ({ id?: number; tagString: string }) to generate pairs from.
 * @param vocabulary - Loaded vocabulary data (maps including index mappings).
 * @param tagModelIndicesForSampling - Array of tag MODEL INDICES (weighted) used for negative sampling.
 * @returns Generated training data arrays.
 */
function generateTrainingPairsFromPosts(
  posts: { id?: number; tagString: string | null }[],
  vocabulary: VocabularyData,
  tagModelIndicesForSampling: number[], // Use model indices for sampling
): TrainingDataArrays {
  const sourceModelIndices: number[] = [];
  const contextModelIndices: number[] = [];
  const labels: number[] = [];

  if (tagModelIndicesForSampling.length === 0) {
    console.warn(
      "No model indices available for negative sampling. Skipping pair generation for this batch.",
    );
    return { sourceModelIndices: [], contextModelIndices: [], labels: [] };
  }

  for (const post of posts) {
    if (!post.tagString) continue;
    const normalizedTagsInPost = post.tagString.split(" ").filter((t) => t.length > 0);

    // Convert normalized tag text to DB IDs, then to MODEL INDICES
    const tagModelIndicesInPost: number[] = normalizedTagsInPost
      .map((tagText) => vocabulary.tagTextToId.get(tagText)) // Get DB ID
      .filter((dbId): dbId is number => dbId !== undefined) // Filter out tags not in vocabulary
      .map((dbId) => vocabulary.dbIdToModelIndex.get(dbId)) // Get Model Index
      .filter((modelIndex): modelIndex is number => modelIndex !== undefined); // Should not be undefined if dbId was found

    if (tagModelIndicesInPost.length < 2) continue; // Need at least two tags for a pair

    // Use a Set for faster lookup of model indices in the current post
    const tagModelIndicesInPostSet = new Set(tagModelIndicesInPost);

    // Generate Positive Pairs: Every tag with every other tag in the post (using MODEL INDICES)
    for (let i = 0; i < tagModelIndicesInPost.length; i++) {
      const sourceIndex = tagModelIndicesInPost[i];

      // Use all other tags in the post as context (using MODEL INDICES)
      for (let j = 0; j < tagModelIndicesInPost.length; j++) {
        if (i === j) continue; // Don't pair a tag with itself
        const contextIndex = tagModelIndicesInPost[j];

        sourceModelIndices.push(sourceIndex);
        contextModelIndices.push(contextIndex);
        labels.push(1); // Positive label
      }

      // Generate Negative Pairs: For each source index, sample negative MODEL INDICES
      for (let k = 0; k < NEGATIVE_SAMPLING_RATIO * tagModelIndicesInPost.length; k++) {
        // Generate more negatives
        let negativeIndex;
        // Sample from the weighted list of model indices until we get a tag NOT in the current post
        do {
          const randomIndex = Math.floor(Math.random() * tagModelIndicesForSampling.length);
          negativeIndex = tagModelIndicesForSampling[randomIndex];
        } while (tagModelIndicesInPostSet.has(negativeIndex)); // Ensure negative is not in the post

        sourceModelIndices.push(sourceIndex);
        contextModelIndices.push(negativeIndex);
        labels.push(0); // Negative label
      }
    }
  }
  return { sourceModelIndices, contextModelIndices, labels };
}

/**
 * Builds the vocabulary (tag ID mappings) from tags in the database that meet a frequency threshold.
 * Counts frequencies by scanning posts. Creates mapping from DB IDs to contiguous model indices.
 * @returns Vocabulary data including index mappings and tag model indices weighted for sampling.
 */
export async function buildVocabularyFromFrequentTags(): Promise<
  VocabularyData & { tagModelIndicesForSampling: number[] }
> {
  console.log("Building vocabulary from frequent tags and creating index mappings...");

  // 1. Count tag frequencies from posts (Scan all posts)
  console.log(`Counting tag frequencies from posts (requires full scan)...`);
  const frequentTagTextsInPosts = new Map<string, number>();

  // Fetch all posts' tag strings efficiently if possible, or in batches
  const allPostsTagStrings = await db
    .select({ tagString: scrapedPosts.tagStringGeneral })
    .from(scrapedPosts);
  console.log(`Fetched tag strings from ${allPostsTagStrings.length} posts.`);

  for (const post of allPostsTagStrings) {
    if (!post.tagString) continue;
    const tagsInPost = post.tagString.split(" ").filter((t) => t.length > 0);
    for (const tagText of tagsInPost) {
      frequentTagTextsInPosts.set(tagText, (frequentTagTextsInPosts.get(tagText) || 0) + 1);
    }
  }
  console.log(`Finished counting frequencies. Found ${frequentTagTextsInPosts.size} unique tags.`);

  // 2. Filter tags by frequency and get their DB IDs
  const frequentTagTexts = Array.from(frequentTagTextsInPosts.keys()).filter(
    (tagText) => frequentTagTextsInPosts.get(tagText)! >= MIN_TAG_FREQUENCY_FOR_VOCAB,
  );

  console.log(
    `Getting DB IDs for ${frequentTagTexts.length} tags meeting minimum frequency (${MIN_TAG_FREQUENCY_FOR_VOCAB})...`,
  );

  const frequentTagRecords =
    frequentTagTexts.length > 0
      ? await db
          .select({ id: tags.id, tagText: tags.tagText })
          .from(tags)
          // Use inArray for Drizzle when available and array is not empty
          .where(inArray(tags.tagText, frequentTagTexts))
      : []; // Return empty array if no frequent tags

  const tagIdToText = new Map<number, string>();
  const tagTextToId = new Map<string, number>(); // Mapping text -> DB ID
  const tagFrequencies = new Map<number, number>(); // Store frequency by DB ID

  frequentTagRecords.forEach((record) => {
    tagIdToText.set(record.id, record.tagText); // DB ID -> Text
    tagTextToId.set(record.tagText, record.id); // Text -> DB ID
    tagFrequencies.set(record.id, frequentTagTextsInPosts.get(record.tagText)!); // Frequency by DB ID
  });

  const numFrequentTags = tagIdToText.size; // Number of tags in our vocabulary
  if (numFrequentTags === 0) {
    throw new Error(
      `No tags meeting frequency threshold (${MIN_TAG_FREQUENCY_FOR_VOCAB}) found to build vocabulary (or no matching IDs found in DB).`,
    ); // Improved error message
  }

  // 3. Create Mapping from DB ID to Model Index (0-indexed or 1-indexed)
  // We'll reserve model index 0 for padding/unknown. Actual tags get indices 1 to numFrequentTags.
  const dbIdToModelIndex = new Map<number, number>();
  const modelIndexToDbId = new Map<number, number>();
  let modelIndexCounter = 1; // Start assigning model indices from 1

  // Sort frequent tag DB IDs to ensure consistent index assignment
  const sortedDbIds = Array.from(tagIdToText.keys()).sort((a, b) => a - b);

  sortedDbIds.forEach((dbId) => {
    dbIdToModelIndex.set(dbId, modelIndexCounter);
    modelIndexToDbId.set(modelIndexCounter, dbId);
    modelIndexCounter++;
  });

  const finalVocabularySize = numFrequentTags + 1; // +1 for padding at index 0

  console.log(
    `Vocabulary size (for model): ${finalVocabularySize} (${numFrequentTags} frequent tags + 1 padding).`,
  );
  console.log(`Mapping ${numFrequentTags} DB IDs to model indices 1 to ${numFrequentTags}.`);

  // 4. Create a list of MODEL INDICES repeated by frequency for sampling
  const tagModelIndicesForSampling: number[] = [];
  sortedDbIds.forEach((dbId) => {
    // Iterate through DB IDs in the vocabulary
    const modelIndex = dbIdToModelIndex.get(dbId)!; // Get the corresponding model index
    const freq = tagFrequencies.get(dbId) || 0; // Get frequency by DB ID
    const numSamples = Math.ceil(Math.pow(freq, 0.75)); // Frequency raised to 0.75 power
    for (let k = 0; k < numSamples; k++) {
      tagModelIndicesForSampling.push(modelIndex); // Add the MODEL INDEX to sampling list
    }
  });
  if (tagModelIndicesForSampling.length === 0) {
    throw new Error(
      "Vocabulary built, but no model indices available for sampling (internal error).",
    );
  }

  console.log(`Prepared ${tagModelIndicesForSampling.length} model indices for sampling.`);

  return {
    vocabularySize: finalVocabularySize,
    tagIdToText, // DB ID -> Text
    tagTextToId, // Text -> DB ID
    dbIdToModelIndex, // DB ID -> Model Index
    modelIndexToDbId, // Model Index -> DB ID
    tagModelIndicesForSampling, // Weighted list of Model Indices
  };
}

/**
 * Prepares training data (positive and negative tag pairs) from posts
 * that are newer than a given post ID, using model indices.
 * A vocabulary must be pre-built and loaded.
 * @param startPostId - Only process posts with IDs greater than this.
 * @param vocabulary - Loaded vocabulary data (maps and size, including index mappings).
 * @param tagModelIndicesForSampling - Array of tag MODEL INDICES (weighted) for negative sampling.
 * @returns Prepared training data arrays and the highest post ID processed.
 */
export async function prepareIncrementalTrainingData(
  startPostId: number,
  vocabulary: VocabularyData, // Pass the full vocabulary data
  tagModelIndicesForSampling: number[],
): Promise<PreparedDataArraysAndId> {
  console.log(`Preparing incremental training data from posts > ${startPostId}...`);

  // Ensure vocabulary is loaded and valid
  if (
    !vocabulary.tagTextToId ||
    !vocabulary.dbIdToModelIndex ||
    !vocabulary.modelIndexToDbId ||
    vocabulary.vocabularySize === 0 ||
    tagModelIndicesForSampling.length === 0
  ) {
    throw new Error(
      "Vocabulary is not loaded, is empty, or missing index mappings. Cannot prepare incremental data.",
    );
  }

  let sourceModelIndices: number[] = []; // Use `let` to allow reassign with concat
  let contextModelIndices: number[] = [];
  let labels: number[] = [];
  let processedCount = 0;
  let highestPostIdInRun = startPostId; // Track the highest ID processed in this run

  // Fetch new posts in batches
  let offset = 0;
  while (true) {
    console.log(
      `Fetching new post batch (offset: ${offset}, limit: ${BATCH_SIZE_DB_FETCH}, id > ${startPostId})...`,
    );
    // Order by ID ascending to ensure we process newer posts
    const batchPosts = await db
      .select({ id: scrapedPosts.id, tagString: scrapedPosts.tagStringGeneral })
      .from(scrapedPosts)
      .where(gt(scrapedPosts.id, startPostId))
      .orderBy(asc(scrapedPosts.id)) // Process in ascending order of ID
      .limit(BATCH_SIZE_DB_FETCH)
      .offset(offset);

    if (batchPosts.length === 0) break; // No more new posts

    console.log(`Fetched ${batchPosts.length} new posts in this batch.`);

    // Generate pairs for the fetched batch, using the index mapping
    const batchTrainingArrays = generateTrainingPairsFromPosts(
      batchPosts,
      vocabulary, // Pass the full vocabulary data
      tagModelIndicesForSampling, // Use the loaded sampling data (which are model indices)
    );

    // --- Use concat instead of spread push to avoid RangeError ---
    sourceModelIndices = sourceModelIndices.concat(batchTrainingArrays.sourceModelIndices);
    contextModelIndices = contextModelIndices.concat(batchTrainingArrays.contextModelIndices);
    labels = labels.concat(batchTrainingArrays.labels);
    // --- END FIX ---

    processedCount += batchPosts.length;
    offset += BATCH_SIZE_DB_FETCH;

    // Update the highest post ID seen in this batch and overall in the run
    currentLastPostId = batchPosts[batchPosts.length - 1].id;
    highestPostIdInRun = Math.max(highestPostIdInRun, currentLastPostId);

    console.log(
      `Processed ~${processedCount} new posts. Current highest ID in batch: ${currentLastPostId}. Generated ${batchTrainingArrays.sourceModelIndices.length} pairs in this batch.`,
    );
  }

  console.log(
    `Finished preparing incremental training data. Total new posts processed: ${processedCount}. Total pairs generated: ${sourceModelIndices.length}. Highest post ID seen in run: ${highestPostIdInRun}.`,
  );

  return {
    sourceModelIndices, // Return model indices arrays
    contextModelIndices,
    labels,
    lastProcessedPostId: highestPostIdInRun, // Return the highest ID encountered in this run
  };
}

// Helper to save the vocabulary maps and sampling data
import * as fs from "node:fs/promises";
import * as path from "node:path";

const VOCAB_FILE = path.join(__dirname, "..", "..", "data", "tag_vocabulary.json"); // Adjust path
const SAMPLING_FILE = path.join(__dirname, "..", "..", "data", "tag_sampling_ids.json"); // Adjust path

export async function saveVocabularyAndSampling(
  vocabulary: VocabularyData,
  tagModelIndicesForSampling: number[], // Save model indices for sampling
) {
  console.log(`Saving vocabulary to ${VOCAB_FILE} and sampling data to ${SAMPLING_FILE}...`);
  const vocabData = {
    vocabularySize: vocabulary.vocabularySize,
    tagIdToText: Array.from(vocabulary.tagIdToText.entries()), // Map to array for JSON
    tagTextToId: Array.from(vocabulary.tagTextToId.entries()), // Map to array for JSON
    dbIdToModelIndex: Array.from(vocabulary.dbIdToModelIndex.entries()), // Map to array for JSON
    modelIndexToDbId: Array.from(vocabulary.modelIndexToDbId.entries()), // Map to array for JSON
  };
  const dir = path.dirname(VOCAB_FILE);
  await fs.mkdir(dir, { recursive: true }); // Ensure data directory exists

  await fs.writeFile(VOCAB_FILE, JSON.stringify(vocabData, null, 2));
  await fs.writeFile(SAMPLING_FILE, JSON.stringify(tagModelIndicesForSampling)); // Save array of model indices
  console.log("Vocabulary and sampling data saved.");
}

export async function loadVocabularyAndSampling(): Promise<
  (VocabularyData & { tagModelIndicesForSampling: number[] }) | null
> {
  console.log(`Loading vocabulary and sampling data from ${VOCAB_FILE} and ${SAMPLING_FILE}...`);
  try {
    const vocabData = JSON.parse(await fs.readFile(VOCAB_FILE, "utf8"));
    const tagModelIndicesForSampling = JSON.parse(
      await fs.readFile(SAMPLING_FILE, "utf8"),
    ) as number[]; // Load array of model indices

    // Reconstruct Maps from arrays - ensure correct types
    const tagIdToText = new Map<number, string>(
      vocabData.tagIdToText.map(([id, text]: [number, string]) => [Number(id), text]),
    );
    const tagTextToId = new Map<string, number>(
      vocabData.tagTextToId.map(([text, id]: [string, number]) => [text, Number(id)]),
    );
    const dbIdToModelIndex = new Map<number, number>(
      vocabData.dbIdToModelIndex.map(([dbId, modelIndex]: [number, number]) => [
        Number(dbId),
        Number(modelIndex),
      ]),
    );
    const modelIndexToDbId = new Map<number, number>(
      vocabData.modelIndexToDbId.map(([modelIndex, dbId]: [number, number]) => [
        Number(modelIndex),
        Number(dbId),
      ]),
    );

    console.log(`Vocabulary loaded with ${tagIdToText.size} tags.`);
    console.log(`Sampling data loaded with ${tagModelIndicesForSampling.length} indices.`);

    return {
      vocabularySize: vocabData.vocabularySize,
      tagIdToText,
      tagTextToId,
      dbIdToModelIndex,
      modelIndexToDbId,
      tagModelIndicesForSampling, // Return loaded model indices for sampling
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.warn(`Vocabulary or sampling file not found.`);
      return null;
    }
    console.error("Failed to load vocabulary or sampling data:", error);
    throw error; // Re-throw other errors
  }
}

// Main function for initial training data preparation (full dataset)
// This is separate from incremental data preparation for fine-tuning
export async function prepareFullTrainingData(): Promise<PreparedDataArraysAndId> {
  // Corrected return type
  // Build vocabulary and get sampling data based on the FULL dataset frequency
  // This also counts frequencies and populates vocabulary maps
  const vocabularyAndSampling = await buildVocabularyFromFrequentTags(); // This now returns vocabulary data + model indices for sampling

  console.log("Preparing full training data pairs (re-scanning all relevant posts)...");
  let sourceModelIndices: number[] = []; // Use `let` for concat
  let contextModelIndices: number[] = [];
  let labels: number[] = [];
  let highestPostIdInRun = 0; // Track the highest ID encountered

  // Fetch all posts' tag strings again to generate pairs for full dataset
  // Process in batches to manage memory
  let offset = 0;
  while (true) {
    const batchPosts = await db
      .select({ id: scrapedPosts.id, tagString: scrapedPosts.tagStringGeneral })
      .from(scrapedPosts)
      .orderBy(asc(scrapedPosts.id)) // Process in ascending order
      .limit(BATCH_SIZE_DB_FETCH)
      .offset(offset);

    if (batchPosts.length === 0) break;

    // Generate pairs using the loaded vocabulary and sampling data (which uses model indices)
    const batchTrainingArrays = generateTrainingPairsFromPosts(
      batchPosts,
      vocabularyAndSampling, // Pass the full vocabulary data including index mappings
      vocabularyAndSampling.tagModelIndicesForSampling, // Use the sampling data (model indices)
    );

    // --- Use concat instead of spread push to avoid RangeError ---
    sourceModelIndices = sourceModelIndices.concat(batchTrainingArrays.sourceModelIndices);
    contextModelIndices = contextModelIndices.concat(batchTrainingArrays.contextModelIndices);
    labels = labels.concat(batchTrainingArrays.labels);
    // --- END FIX ---

    offset += BATCH_SIZE_DB_FETCH;
    highestPostIdInRun = Math.max(highestPostIdInRun, batchPosts[batchPosts.length - 1].id);
    console.log(
      `Processed ~${offset} posts for full data prep. Current highest ID in batch: ${batchPosts[batchPosts.length - 1].id}. Generated ${batchTrainingArrays.sourceModelIndices.length} pairs in this batch.`,
    );
  }

  console.log(
    `Finished preparing full training data. Total pairs generated: ${sourceModelIndices.length}. Highest post ID seen: ${highestPostIdInRun}.`,
  );

  return {
    sourceModelIndices, // Return model indices arrays
    contextModelIndices,
    labels,
    lastProcessedPostId: highestPostIdInRun,
    // Vocabulary info is available separately from buildVocabularyFromFrequentTags if needed here
  };
}

// Need to expose buildVocabularyFromFrequentTags for initial script
