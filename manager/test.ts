// Example script to run daily (simplified)
// Ensure these paths are correct for your project structure
import PostService from "./src/services/fetch/posts"; // Assuming this is your post fetching service
// import CorrelationService from "./src/services/fetch/correlation"; // Optional: Keep if you still want traditional correlations
import PromptService from "./src/services/generation/prompt"; // Your new PromptService

async function dailyRun() {
  console.log("--- Starting Daily Run ---");

  // 1. Acquire new posts
  console.log("Starting Daily Data Acquisition...");
  try {
    await PostService.acquireNewPosts();
    console.log("Daily Data Acquisition Finished.");
  } catch (error) {
    console.error("Error during data acquisition:", error);
    // Decide if you should stop here or continue with analysis on existing data
    // For this example, we'll log and continue.
  }

  // 2. Initialize PromptService (loads model, vocab, state)
  // This MUST happen before fine-tuning or suggesting
  try {
    await PromptService.init();
    console.log("PromptService Initialization Complete.");
  } catch (error) {
    console.error("Failed to initialize PromptService. Cannot fine-tune or suggest.", error);
    // If init fails (e.g., model or vocab not found), we cannot proceed with ML steps
    // You might need to handle the *very first* run where no model exists differently.
    // The PromptService init should log if the model is missing.
    // For the first run, you'd typically run the separate trainEmbeddings.ts script first.
    return; // Stop if PromptService couldn't initialize
  }

  // 3. Fine-tune the ML model with new data
  // The fineTuneModel method handles getting new posts, preparing data, training, and saving state.
  console.log("Starting Model Fine-tuning...");
  try {
    await PromptService.fineTuneModel(); // This is now an awaitable promise from PromptService
    console.log("Model Fine-tuning Process Complete.");
  } catch (error) {
    console.error("Error during model fine-tuning:", error);
    // Log error, but suggestion might still work with the previously saved model
  }

  // 4. (Optional) Recalculate traditional correlations
  // Keep this step if you still use the relationshipWeights table for other purposes
  /*
  console.log("--- Starting Daily Correlation Calculation ---");
  try {
    await CorrelationService.calculateAndStoreTagRelationships();
    console.log("--- Daily Correlation Calculation Finished ---");
  } catch (error) {
       console.error("Error during correlation calculation:", error);
  }
  */

  // 5. Generate suggestions using the ML model
  // Model should be loaded/fine-tuned by now (or PromptService init failed)
  console.log("Starting Prompt Suggestion Test...");
  try {
    const suggestions = await PromptService.suggestTags(["1girl", "blue_hair", "panties"], 20); // Pass limit
    console.log('Suggestions for ["1girl", "blue_hair", "panties"]:', suggestions);

    // Example with tags from previous issue
    const suggestions2 = await PromptService.suggestTags(["mature_male", "nipples"], 20); // Pass limit
    console.log('Suggestions for ["mature_male", "nipples"]:', suggestions2);
  } catch (error) {
    console.error("Error during prompt suggestion:", error);
  }

  console.log("--- Daily Run Finished ---");
  // The await calls ensure the script waits for these async operations to complete.
}

// Execute the daily run function
dailyRun().catch(console.error);
