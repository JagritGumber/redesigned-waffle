// src/training/trainEmbeddingsWrapper.ts
// This script wraps the Python training process.

import * as tf from "@tensorflow/tfjs";
// Using Bun's subprocess API for simplicity, Node.js uses 'child_process'
import { spawn } from "node:child_process"; // Using Node's built-in for broader compatibility
import * as path from "node:path";
import * as fs from "node:fs/promises"; // Use fs.promises for async file operations

// Import necessary functions (assuming they are adapted to return data directly or provide paths)
import {
  prepareFullTrainingData, // This should return the data or a path to it
  saveVocabularyAndSampling, // This saves vocab/sampling for later use
  buildVocabularyFromFrequentTags, // This builds the vocab
} from "./prepareTrainingData"; // Adjust path

import { trainingState } from "@/schema/trainingState"; // Adjust path
import db from "@/db"; // Import DB
import { max } from "drizzle-orm";

// Configuration
const EMBEDDING_DIM = 128; // Size of the embedding vectors - Keep consistent with Python script
const PYTHON_SCRIPT_PATH = path.join(__dirname, "..", "..", "..", "..", "model", "train_model.py"); // Adjust path to your Python script
const MODEL_SAVE_DIR_PYTHON = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "tag-embedding-model-python",
); // Directory for Python SavedModel
const DATA_TEMP_PATH = path.join(__dirname, "..", "..", "data", "temp_training_data.json"); // Temporary file for data transfer

/**
 * Orchestrates the training process by spawning a Python subprocess.
 */
async function trainEmbeddingModelWithPython() {
  console.log("Starting embedding model training using Python subprocess...");

  // 1. Prepare Data and Vocabulary in Node/Bun
  console.log("Preparing data and vocabulary...");
  // Need to get vocab first to build the model (in Python), then get training data based on that vocab
  const vocabularyAndSampling = await buildVocabularyFromFrequentTags();

  // Prepare training data using the generated vocabulary and sampling data
  // Modify prepareFullTrainingData to return the raw data arrays
  const trainingData = await prepareFullTrainingData();

  if (trainingData.sourceModelIndices.length === 0) {
    console.error("No training data generated. Cannot train model.");
    return;
  }

  // Save the vocabulary and sampling data for future reference/inference
  await saveVocabularyAndSampling(
    vocabularyAndSampling,
    vocabularyAndSampling.tagModelIndicesForSampling,
  );

  // 2. Save Data to a Temporary File for Python
  console.log(`Saving training data to temporary file: ${DATA_TEMP_PATH}`);
  try {
    // Create the data directory if it doesn't exist
    await fs.mkdir(path.dirname(DATA_TEMP_PATH), { recursive: true });

    const dataToSave = {
      sourceModelIndices: trainingData.sourceModelIndices,
      contextModelIndices: trainingData.contextModelIndices,
      labels: trainingData.labels,
    };
    await fs.writeFile(DATA_TEMP_PATH, JSON.stringify(dataToSave), "utf8");
    console.log("Training data saved.");
  } catch (error) {
    console.error("Error saving temporary data file:", error);
    return; // Stop if data saving fails
  }

  // Ensure the model save directory exists before calling Python
  await fs.mkdir(MODEL_SAVE_DIR_PYTHON, { recursive: true });

  // 3. Spawn Python Subprocess for Training
  console.log(`Spawning Python script: ${PYTHON_SCRIPT_PATH}`);
  const pythonProcess = spawn(
    "python3", // Or 'python' depending on your system's command
    [
      PYTHON_SCRIPT_PATH,
      DATA_TEMP_PATH, // Pass data file path
      vocabularyAndSampling.vocabularySize.toString(), // Pass vocab size
      MODEL_SAVE_DIR_PYTHON, // Pass model save directory
    ],
    { stdio: ["ignore", "pipe", "pipe"] }, // Pipe stdout and stderr
  );

  let pythonStdout = "";
  let pythonStderr = "";

  pythonProcess.stdout.on("data", (data) => {
    pythonStdout += data.toString();
    process.stdout.write(data); // Pipe Python's stdout to Node/Bun's stdout
  });

  pythonProcess.stderr.on("data", (data) => {
    pythonStderr += data.toString();
    process.stderr.write(data); // Pipe Python's stderr to Node/Bun's stderr
  });

  // Wait for the Python process to finish
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    pythonProcess.on("error", (err) => {
      console.error("Failed to start Python subprocess.", err);
      reject(err);
    });
    pythonProcess.on("close", (code) => {
      console.log(`Python process exited with code ${code}`);
      resolve(code);
    });
  });

  // 4. Check Python Exit Code and Load Model
  if (exitCode === 0) {
    console.log("Python training script completed successfully.");
    console.log("Attempting to load the model saved by Python...");
    const modelJsonPath = path.join(MODEL_SAVE_DIR_PYTHON, "model.json"); // SavedModel doesn't create model.json directly, but loadLayersModel can handle the directory

    try {
      // TF.js loadLayersModel can load the Keras SavedModel directory
      // It looks for the saved_model.pb file
      const loadedModel = await tf.loadLayersModel(`file://${MODEL_SAVE_DIR_PYTHON}`);
      console.log("Model loaded successfully into TensorFlow.js!");

      // You can now use loadedModel for inference within Node/Bun
      // Example: Print summary
      loadedModel.summary();

      // 5. Record Training State (Optional, based on your needs)
      console.log("Recording last trained post ID...");
      try {
        const maxPostId = trainingData.lastProcessedPostId;
        await db
          .insert(trainingState)
          .values({ id: 1, lastTrainedPostId: maxPostId, lastTrainedAt: new Date() })
          .onConflictDoUpdate({
            target: trainingState.id,
            set: {
              lastTrainedPostId: maxPostId,
              lastTrainedAt: new Date(),
            },
          });
        console.log(`Recorded last trained post ID as: ${maxPostId}.`);
      } catch (error) {
        console.error("Failed to record training state:", error);
      }
    } catch (loadError) {
      console.error("Failed to load model saved by Python:", loadError);
      console.error("Python STDOUT:\n", pythonStdout);
      console.error("Python STDERR:\n", pythonStderr);
    }
  } else {
    console.error(`Python training script failed with exit code ${exitCode}.`);
    console.error("Python STDOUT:\n", pythonStdout);
    console.error("Python STDERR:\n", pythonStderr);
  }

  // 5. Clean up temporary data file
  console.log(`Cleaning up temporary data file: ${DATA_TEMP_PATH}`);
  try {
    await fs.unlink(DATA_TEMP_PATH);
    console.log("Temporary data file removed.");
  } catch (error) {
    console.warn(`Could not remove temporary data file ${DATA_TEMP_PATH}:`, error);
    // Warn but don't fail the process
  }

  console.log("Embedding model training process via Python subprocess complete.");
}

// Ensure directory for Python script exists if you put it there
// (You might need to manually create a 'scripts' directory and place train_model.py inside)
// await fs.mkdir(path.dirname(PYTHON_SCRIPT_PATH), { recursive: true });
// ... then copy train_model.py there if needed

// Execute the wrapper function
trainEmbeddingModelWithPython().catch(console.error);
