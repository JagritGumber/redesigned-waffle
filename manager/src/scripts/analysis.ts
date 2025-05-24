// Example: Saving results to the database (using your existing db and schema imports)
import db from "@/db"; // Adjust path
import { tags, tagCorrelations } from "@/schema"; // Import your schema tables
import { calculateCorrelations } from "@/utils/correlations";
import { acquireData } from "@/utils/fetcher";
import { calculateCounts } from "@/utils/tags";
import { eq } from "drizzle-orm";

async function saveAnalysisResults(
  counts: {
    individualTagCounts: Map<string, number>;
    coOccurrenceCounts: Map<string, Map<string, number>>;
    totalPosts: number;
  },
  correlations: { tag1: string; tag2: string; weight: number }[]
) {
  console.log("Saving analysis results to database...");

  // 1. Clear existing tags and correlations (optional, but good for refresh)
  console.log("Clearing existing tags and correlations...");
  await db.delete(tagCorrelations); // Delete correlations first as they reference tags
  await db.delete(tags);
  console.log("Cleared.");

  // 2. Insert frequent tags and get their IDs
  const tagsToInsert = Array.from(counts.individualTagCounts.entries()).map(
    ([tagText, frequency]) => ({
      tagText: tagText,
      danbooruFrequency: frequency, // Store frequency
      baseWeight: Math.log(frequency > 0 ? frequency : 1), // Example base weight based on log frequency
      // Keep existing formalLevelBias or other manual fields if you have them
      formalLevelBias: null, // Or load from a manual list if you maintain one
    })
  );

  console.log(`Inserting ${tagsToInsert.length} frequent tags...`);
  // Drizzle returning() might have limits, might need batch inserts for large lists
  // Check Drizzle docs for batching insert examples
  // For simplicity here, assuming a single insert works or handling batches
  const insertedTags = await db
    .insert(tags)
    .values(tagsToInsert)
    .returning({ id: tags.id, tagText: tags.tagText });
  const tagTextToIdMap = insertedTags.reduce((map, tag) => {
    map[tag.tagText] = tag.id;
    return map;
  }, {} as Record<string, number>);
  console.log("Tags inserted and mapped.");

  // 3. Insert correlations using the new tag IDs
  const correlationsToInsert = correlations
    .map((corr) => {
      const tag1Id = tagTextToIdMap[corr.tag1];
      const tag2Id = tagTextToIdMap[corr.tag2];

      // Ensure both tags were successfully inserted (they should be if filtered correctly)
      if (tag1Id !== undefined && tag2Id !== undefined) {
        // Ensure tag1Id < tag2Id for the unique constraint on the pair
        const [sortedTag1Id, sortedTag2Id] = [tag1Id, tag2Id].sort((a, b) => a - b);
        return {
          tag1Id: sortedTag1Id,
          tag2Id: sortedTag2Id,
          correlationWeight: corr.weight, // Store the calculated PMI
        };
      }
      return null; // Skip if tags weren't found (indicates issue in filtering/mapping)
    })
    .filter(Boolean); // Remove null entries

  console.log(`Inserting ${correlationsToInsert.length} tag correlations...`);
  const batchSize = 500;
  for (let i = 0; i < correlationsToInsert.length; i += batchSize) {
    const batch = correlationsToInsert.slice(i, i + batchSize);
    if (batch.length > 0) {
      await db.insert(tagCorrelations).values(batch.filter((val) => val !== null));
      console.log(
        `Inserted batch ${i / batchSize + 1}/${Math.ceil(correlationsToInsert.length / batchSize)}`
      );
    }
  }
  console.log("Tag correlations inserted.");

  console.log("Analysis results saved.");
}

// --- Main script to run the whole analysis pipeline ---
async function runFullAnalysisAndSave() {
  console.log("Starting full Danbooru analysis...");
  const dataDir = "../danbooru_data"; // Directory where you saved acquired data

  // 1. Acquire data (uncomment and run fetchDanbooruPosts loop first time)
  //   await acquireData(); // Make sure you run this and save files

  // 2. Calculate counts
  console.log("Calculating tag frequencies and co-occurrence counts...");
  const counts = await calculateCounts(dataDir);
  if (!counts) {
    console.error("Failed to calculate counts.");
    return;
  }
  console.log("Counts calculated.");

  // 3. Calculate correlations
  console.log("Calculating tag correlations...");
  const correlations = await calculateCorrelations(counts);
  console.log("Correlations calculated.");

  // 4. Save to database
  console.log("Saving results to database...");
  await saveAnalysisResults(counts, correlations);
  console.log("Analysis pipeline finished.");
}

runFullAnalysisAndSave().catch(console.error); // Execute the full pipeline
