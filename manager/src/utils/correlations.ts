// Example: Calculating PMI
export async function calculateCorrelations(counts: {
  individualTagCounts: Map<string, number>;
  coOccurrenceCounts: Map<string, Map<string, number>>;
  totalPosts: number;
}) {
  const tagCorrelations: { tag1: string; tag2: string; weight: number }[] = [];
  const { individualTagCounts, coOccurrenceCounts, totalPosts } = counts;

  if (totalPosts === 0) {
    console.warn("No posts processed, cannot calculate correlations.");
    return [];
  }

  // Iterate through the filtered co-occurrence counts
  for (const [tag1, innerMap] of coOccurrenceCounts.entries()) {
    const count1 = individualTagCounts.get(tag1) || 0; // Should exist due to filtering

    for (const [tag2, coOccurrenceCount] of innerMap.entries()) {
      const count2 = individualTagCounts.get(tag2) || 0; // Should exist

      // Calculate PMI
      // Add smoothing (e.g., +1) to counts to avoid log(0) if strict filtering isn't perfect
      // Or rely on filtering low-frequency tags to avoid this. Let's rely on filtering for now.
      // Ensure counts > 0 for calculation - filtering should guarantee this.
      if (count1 > 0 && count2 > 0 && coOccurrenceCount > 0) {
        const p_tag1 = count1 / totalPosts;
        const p_tag2 = count2 / totalPosts;
        const p_tag1_tag2 = coOccurrenceCount / totalPosts;

        const pmi = Math.log2(p_tag1_tag2 / (p_tag1 * p_tag2));

        // Optionally, filter out negative PMI or very low PMI
        // For prompt generation, we often only care about positive correlation
        if (pmi > 0) {
          // Keep only positively correlated tags
          tagCorrelations.push({ tag1: tag1, tag2: tag2, weight: pmi });
        }
      }
    }
  }

  console.log(`Calculated ${tagCorrelations.length} positive tag correlations (PMI > 0).`);

  // Optional: Sort correlations by weight if you want to see the strongest ones
  // tagCorrelations.sort((a, b) => b.weight - a.weight);

  return tagCorrelations;
}

// async function runAnalysis() {
//     const counts = await calculateCounts('./danbooru_data');
//     if (counts) {
//          const correlations = await calculateCorrelations(counts);
//          console.log("Example Correlations:", correlations.slice(0, 20)); // Print top 20
//          // Now save these correlations to your database!
//     }
// }
// runAnalysis().catch(console.error);
