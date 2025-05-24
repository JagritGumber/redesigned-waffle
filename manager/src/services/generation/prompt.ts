// src/services/PromptService.ts

import db from "@/db"; // Adjust path
import { tags } from "@/schema/tags"; // Adjust path
import { trainingState } from "@/schema/trainingState"; // Import training state schema // Adjust path
import { scrapedPosts } from "@/schema/scrapedPosts"; // Import scrapedPosts for fine-tuning data prep // Adjust path

import { normalizeTag } from "@/utils/tags"; // Import normalization utility // Adjust path
// Import incremental data prep and vocabulary loading
import {
  prepareIncrementalTrainingData,
  loadVocabularyAndSampling,
  VocabularyData,
  TrainingDataArrays,
  buildVocabularyFromFrequentTags,
  saveVocabularyAndSampling,
} from "@/services/training/prepareTrainingData"; // Adjust path
// Removed buildModel import as model is loaded, not built here

import * as tf from "@tensorflow/tfjs"; // *** Use tfjs instead of tfjs-node ***
import * as path from "node:path"; // Required for paths
import { eq, inArray, sql, desc, max } from "drizzle-orm"; // Drizzle operators

// Configuration
const MODEL_SAVE_PATH = "file://" + path.join(__dirname, "..", "..", "data", "tag-embedding-model"); // Adjust path relative to this file
const VOCAB_SAMPLING_FILE = path.join(__dirname, "..", "..", "data", "tag_sampling_ids.json"); // Adjust path
const SUGGESTION_LIMIT = 20;
const SIMILARITY_THRESHOLD = 0; // Minimum cosine similarity (adjust as needed)

// Configuration for Fine-tuning
const EPOCHS_FINE_TUNE = 1; // Fewer epochs for fine-tuning
const BATCH_SIZE_TRAINING = 1024; // Same batch size as initial training
const LEARNING_RATE_FINE_TUNE = 0.0001; // Lower learning rate for fine-tuning (e.g., 1/10th of initial)
const MIN_PAIRS_FOR_FINETUNE = 1000; // Minimum number of new training pairs needed to trigger fine-tuning

// --- Service State ---
let model: tf.LayersModel | null = null; // The loaded model
let vocabulary: (VocabularyData & { tagIdsForSampling: number[] }) | null = null; // Loaded vocabulary and sampling data
let tagEmbeddingsTensor: tf.Tensor2D | null = null; // Tensor containing all tag embeddings (VocabSize, EmbeddingDim)
let vocabularySize = 0; // Keep track of vocabulary size from loaded vocab
let embeddingDim = 0; // Keep track of embedding dimension from loaded model weights
let lastTrainedPostId = 0; // State variable for the last post ID used in training

/**
 * Loads the training state (last trained post ID) from the database.
 */
async function _loadTrainingState(): Promise<void> {
  console.log("Loading training state...");
  try {
    const state = await db.select().from(trainingState).where(eq(trainingState.id, 1)).limit(1);
    if (state.length > 0) {
      lastTrainedPostId = state[0].lastTrainedPostId;
      console.log(`Loaded last trained post ID: ${lastTrainedPostId}`);
    } else {
      console.warn("No training state found in DB. Starting with last trained post ID 0.");
      lastTrainedPostId = 0; // Default if no record exists
    }
  } catch (error) {
    console.error("Failed to load training state:", error);
    // Continue with default 0 if DB read fails
    lastTrainedPostId = 0;
  }
}

/**
 * Saves the training state (last trained post ID) to the database.
 * @param newLastTrainedPostId The new highest post ID successfully used for training.
 */
async function _saveTrainingState(newLastTrainedPostId: number): Promise<void> {
  console.log(`Saving new last trained post ID: ${newLastTrainedPostId}...`);
  try {
    // Use ID 1 for the single row, timestamp in seconds
    await db
      .insert(trainingState)
      .values({
        id: 1,
        lastTrainedPostId: newLastTrainedPostId,
        lastTrainedAt: Math.floor(Date.now() / 1000),
      })
      .onConflictDoUpdate({
        target: trainingState.id,
        set: {
          lastTrainedPostId: newLastTrainedPostId,
          lastTrainedAt: Math.floor(Date.now() / 1000),
        },
      });
    lastTrainedPostId = newLastTrainedPostId; // Update service state
    console.log("Training state saved successfully.");
  } catch (error) {
    console.error("Failed to save training state:", error);
    // This is a critical error for fine-tuning tracking
    throw error;
  }
}

/**
 * Initializes the PromptService by loading the trained model and vocabulary.
 * This should be called once when your application starts.
 */
async function initializePromptService() {
  console.log("Initializing PromptService...");

  // Load training state first
  await _loadTrainingState();

  // Load vocabulary and sampling data
  vocabulary = await loadVocabularyAndSampling();
  if (!vocabulary) {
    console.error("Vocabulary and sampling data not found. Please run initial training script.");
    // Model cannot be loaded without vocabulary size
    return; // Keep model as null, vocbaulary as null
  }
  vocabularySize = vocabulary.vocabularySize;

  // Load the model
  console.log(`Loading tag embedding model from ${MODEL_SAVE_PATH}/model.json...`);
  try {
    model = await tf.loadLayersModel(MODEL_SAVE_PATH + "/model.json"); // Load the model structure and weights

    // Get the learned embedding weights
    const embeddingLayer = model.getLayer("embedding");
    if (!embeddingLayer) {
      throw new Error("Embedding layer 'embedding' not found in the loaded model.");
    }
    const embeddingWeights = embeddingLayer.getWeights()[0]; // Weights are usually the first tensor

    tagEmbeddingsTensor = embeddingWeights as tf.Tensor2D; // Shape [VocabSize, EmbeddingDim]
    embeddingDim = tagEmbeddingsTensor.shape[1]; // Get embedding dim from loaded weights

    // Basic sanity check on vocabulary size vs embedding size
    // Assuming tag IDs are 0-indexed and vocabularySize includes all indices up to max ID + 1.
    // A safer check: Does the embedding tensor have enough rows for the max tag ID in the map?
    if (vocabulary.tagIdToText.size > 0) {
      // Only check if vocabulary is not empty
      const maxTagIdInMap = Math.max(...Array.from(vocabulary.tagIdToText.keys()));
      if (tagEmbeddingsTensor.shape[0] <= maxTagIdInMap) {
        console.error(
          `Embedding tensor size mismatch: Tensor has ${tagEmbeddingsTensor.shape[0]} rows, but max tag ID in vocabulary is ${maxTagIdInMap}. This will cause indexing errors.`,
        );
        // Invalidate model if mismatch
        model = null;
        tagEmbeddingsTensor = null;
        // Do NOT throw, allow PromptService to return empty gracefully.
        return;
      }
    } else if (tagEmbeddingsTensor.shape[0] > 1) {
      // Check if model has embeddings but vocabulary is empty
      console.warn(
        `Loaded model with embeddings (${tagEmbeddingsTensor.shape[0]} rows) but vocabulary is empty.`,
      );
      // Model is likely useless without vocabulary
      model = null;
      tagEmbeddingsTensor = null;
    }

    console.log(`Model loaded successfully. Embedding dimension: ${embeddingDim}.`);

    console.log("PromptService initialized.");
  } catch (error: any) {
    if (
      error.message?.includes("model.json not found") ||
      error.message?.includes("No such file or directory")
    ) {
      console.warn(
        `Model file not found at ${MODEL_SAVE_PATH}/model.json. Please run initial training script first.`,
      );
    } else {
      console.error("Failed to initialize PromptService (model loading failed):", error);
    }
    // Keep model/tensor as null if loading failed
    model = null;
    tagEmbeddingsTensor = null;
    // Do not throw, allow PromptService to return empty gracefully.
  }
}

const PromptService = {
  // Public method to trigger initialization
  async init() {
    if (!model) {
      // Only initialize if not already initialized
      await initializePromptService();
    } else {
      console.log("PromptService already initialized.");
    }
  },

  /**
   * Suggests additional tags based on a list of input tags using learned tag embeddings.
   * Finds tags whose embeddings are closest to the average embedding of the input tags.
   * @param seedTags - An array of raw tag strings provided by the user.
   * @param limit - The maximum number of suggestions to return.
   * @returns A promise resolving to an array of suggested tags with their calculated relevance scores (cosine similarity).
   */
  async suggestTags(
    seedTags: string[],
    limit: number = SUGGESTION_LIMIT,
  ): Promise<{ tagText: string; score: number }[]> {
    await this.init(); // Ensure service is initialized

    if (
      !model ||
      !tagEmbeddingsTensor ||
      !vocabulary ||
      !vocabulary.tagTextToId ||
      !vocabulary.tagIdToText
    ) {
      console.error(
        "PromptService not fully initialized (model or vocabulary missing). Cannot suggest tags.",
      );
      return [];
    }

    console.log(`Generating suggestions for seed tags: ${seedTags.join(", ")}`);

    if (!seedTags || seedTags.length === 0) {
      console.log("No seed tags provided. Returning empty suggestions.");
      return [];
    }

    // 1. Normalize input tags and get their IDs from the loaded vocabulary
    const seedTagIds: number[] = seedTags
      .map((tag) => normalizeTag(tag))
      .filter((tag) => tag.length > 0)
      .map((normalizedTag) => vocabulary!.tagTextToId.get(normalizedTag)) // Use the loaded map
      .filter((id): id is number => id !== undefined); // Filter out undefined IDs (tags not in vocab)

    if (seedTagIds.length === 0) {
      console.log(
        "None of the provided seed tags found in the vocabulary. Cannot generate suggestions.",
      );
      return [];
    }
    console.log(`Found ${seedTagIds.length} / ${seedTags.length} seed tags in the vocabulary.`);

    // Use tf.tidy to automatically clean up intermediate tensors
    return tf.tidy(() => {
      // 2. Retrieve embeddings for seed tags and calculate the query vector (average embedding)
      const seedEmbeddings: tf.Tensor[] = [];
      for (const id of seedTagIds) {
        // Get the embedding vector for this ID from the main embeddings tensor
        // Need to be careful with index 0 if vocabulary includes a padding token at index 0
        // Assuming tag IDs are non-negative and correspond to valid indices.
        seedEmbeddings.push(tagEmbeddingsTensor!.slice([id, 0], [1, embeddingDim])); // Slice returns [1, embedding_dim]
      }

      // Stack the seed embeddings and calculate the mean along axis 0
      const stackedSeedEmbeddings = tf.stack(seedEmbeddings); // Shape [num_seed_tags, 1, embedding_dim]
      const stackedSeedEmbeddingsReshaped = stackedSeedEmbeddings.reshape([
        seedTagIds.length,
        embeddingDim,
      ]); // Shape [num_seed_tags, embedding_dim]

      const queryVector = tf.mean(stackedSeedEmbeddingsReshaped, 0).expandDims(0); // Shape [1, embedding_dim]

      // 3. Calculate cosine similarity between the query vector and ALL tag embeddings
      // Cosine similarity is (A dot B) / (||A|| * ||B||)
      // A simpler way is (A dot B^T). If A and B are already normalized to unit length, this is cosine similarity.
      // Let's L2 normalize the query vector and the main tag embeddings tensor.
      const normalizedQueryVector = tf.l2Normalize(queryVector);
      const normalizedTagEmbeddings = tf.l2Normalize(tagEmbeddingsTensor!); // Normalize all embeddings

      // Calculate dot product: (1, embedding_dim) * (embedding_dim, VocabSize) = (1, VocabSize)
      const similarityScores = tf.matMul(
        normalizedQueryVector,
        normalizedTagEmbeddings,
        false,
        true,
      ); // Transpose normalizedTagEmbeddings

      // Squeeze the result to get a 1D tensor of scores [VocabSize]
      const scoresArray = similarityScores.squeeze().arraySync() as number[];

      // 4. Collect suggestions and filter out seed tags
      const suggestions: { tagId: number; score: number }[] = [];
      const seedTagIdSet = new Set(seedTagIds); // For quick lookup

      // Iterate through all possible tag IDs (indices of the embedding tensor)
      for (let id = 0; id < vocabularySize; id++) {
        // Check if tagId is valid (in vocabulary map) and not one of the seed tags
        // Assuming tag ID 0 might be a padding token and not a real tag to suggest
        if (id !== 0 && vocabulary!.tagIdToText.has(id) && !seedTagIdSet.has(id)) {
          const score = scoresArray[id];
          // Only include suggestions above a minimum similarity threshold
          if (score >= SIMILARITY_THRESHOLD) {
            suggestions.push({ tagId: id, score: score });
          }
        }
      }

      // 5. Sort suggestions by score (descending)
      suggestions.sort((a, b) => b.score - a.score);

      // 6. Limit and get tag text
      const topSuggestions = suggestions.slice(0, limit);

      const finalSuggestions = topSuggestions.map((s) => ({
        tagText: vocabulary!.tagIdToText.get(s.tagId)!, // Get tag text from the map
        score: s.score,
      }));

      console.log(`Generated ${finalSuggestions.length} suggestions.`);

      return finalSuggestions;
    }); // tf.tidy cleans up tensors created inside
  },

  /**
   * Fine-tunes the loaded model using data from newly acquired posts.
   * Updates the last trained post ID in the database upon success.
   * Requires model and vocabulary to be loaded first via init().
   */
  async fineTuneModel() {
    await this.init(); // Ensure model and state are loaded

    if (
      !model ||
      !vocabulary ||
      !vocabulary.tagTextToId ||
      !vocabulary.tagIdsForSampling ||
      vocabulary.vocabularySize === 0
    ) {
      console.error(
        "Model, vocabulary, or sampling data not loaded or is empty. Cannot fine-tune.",
      );
      return;
    }
    // Ensure vocabulary size matches current model's embedding layer input dim if rebuilding
    const embeddingLayer = model.getLayer("embedding");
    if (
      !embeddingLayer ||
      embeddingLayer.inputSpec?.[0].axes?.[0].size !== vocabulary.vocabularySize
    ) {
      console.error(
        "Loaded model's embedding layer input dimension does not match vocabulary size. Cannot fine-tune this model with this vocabulary.",
      );
      console.log(
        `Model embedding input dim: ${embeddingLayer?.inputSpec?.[0].axes?.[0].size}, Vocabulary size: ${vocabulary.vocabularySize}`,
      );
      return;
    }

    console.log(`Starting model fine-tuning from last trained post ID: ${lastTrainedPostId}...`);

    // 1. Prepare data from NEW posts (newer than lastTrainedPostId)
    const incrementalData = await prepareIncrementalTrainingData(
      lastTrainedPostId,
      vocabulary, // Pass loaded vocabulary for ID lookups
      vocabulary.tagIdsForSampling, // Use loaded sampling data
    );

    if (incrementalData.sourceTagIds.length < MIN_PAIRS_FOR_FINETUNE) {
      console.log(
        `Not enough new training pairs (${incrementalData.sourceTagIds.length}) generated for fine-tuning (minimum ${MIN_PAIRS_FOR_FINETUNE}). Fine-tuning skipped.`,
      );
      return;
    }
    console.log(
      `Generated ${incrementalData.sourceTagIds.length} new training pairs from posts > ${lastTrainedPostId}. Highest processed post ID in this data: ${incrementalData.lastProcessedPostId}.`,
    );

    // Convert training data arrays to TensorFlow.js Tensors
    const sourceTagIdsTensor = tf.tensor(
      incrementalData.sourceTagIds,
      [incrementalData.sourceTagIds.length, 1],
      "int32",
    );
    const contextTagIdsTensor = tf.tensor(
      incrementalData.contextTagIds,
      [incrementalData.contextTagIds.length, 1],
      "int32",
    );
    const labelsTensor = tf.tensor(
      incrementalData.labels,
      [incrementalData.labels.length, 1],
      "float32",
    );

    // 2. Compile model for fine-tuning (optional: use a lower learning rate)
    // Use a new optimizer instance for fine-tuning learning rate
    const fineTuneOptimizer = tf.train.adam(LEARNING_RATE_FINE_TUNE);
    console.log(
      `Compiling model for fine-tuning with learning rate: ${fineTuneLearningRate}. Optimizer state is reset.`,
    );
    model.compile({
      optimizer: fineTuneOptimizer, // Use the fine-tune optimizer
      loss: "binaryCrossentropy",
      metrics: ["accuracy"],
    });

    // 3. Train the model further
    console.log("Starting fine-tuning fit...");
    // Using tf.tidy for the fit call to help manage tensors created during training
    const fitPromise = tf.tidy(() => {
      return model!.fit([sourceTagIdsTensor, contextTagIdsTensor], labelsTensor, {
        epochs: EPOCHS_FINE_TUNE, // Fine-tune for fewer epochs usually
        batchSize: BATCH_SIZE_TRAINING,
        shuffle: true,
        // validationSplit not strictly needed for fine-tuning on new data
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(
              `Fine-tune Epoch ${epoch + 1}: loss = ${logs?.loss?.toFixed(4)}, accuracy = ${logs?.acc?.toFixed(4)}`,
            );
          },
        },
      });
    }); // tf.tidy end

    // Wait for fit to complete
    try {
      await fitPromise;
      console.log("Fine-tuning fit complete.");

      // 4. Save the fine-tuned model
      console.log(`Saving fine-tuned model to ${MODEL_SAVE_PATH}...`);
      await model.save(MODEL_SAVE_PATH);
      console.log("Fine-tuned model saved.");

      // 5. Record the new last trained post ID only after successful save
      // Use the last ID from the incremental data preparation if it's newer
      if (incrementalData.lastProcessedPostId > lastTrainedPostId) {
        await _saveTrainingState(incrementalData.lastProcessedPostId);
      } else {
        console.log("No new posts processed beyond previous training state.");
      }
    } catch (error) {
      console.error("Fine-tuning fit or save failed:", error);
      // The service state (lastTrainedPostId) is not updated if save fails.
      // The model in memory might be partially fine-tuned, but the saved one isn't.
      // A more robust approach would handle this failure scenario (e.g., retry save).
      throw error; // Re-throw to signal failure
    } finally {
      // Dispose tensors created *before* fit, *after* fit promise resolves/rejects
      tf.dispose([sourceTagIdsTensor, contextTagIdsTensor, labelsTensor]);
      console.log("Fine-tuning tensors disposed.");
    }

    console.log("Fine-tuning process complete.");
  },
};

// Do NOT auto-initialize here if the daily script manages initialization.

export default PromptService;
