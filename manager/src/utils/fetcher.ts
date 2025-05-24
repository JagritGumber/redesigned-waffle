// Example: Fetching posts using node-fetch (install with npm install node-fetch)
import fetch from "node-fetch";
import fs from "node:fs/promises";
import path from "node:path";

const DANBOORU_API_URL = "https://danbooru.donmai.us";
const POSTS_PER_PAGE = 100; // Max limit per page
const NUM_PAGES_TO_FETCH = 1000; // Example: Fetch 1000 pages * 100 posts/page = 100,000 posts
const DELAY_MS = 500; // Delay between requests to respect rate limits

export async function fetchDanbooruPosts(page: number): Promise<any[] | null> {
  const url = `${DANBOORU_API_URL}/posts.json?limit=${POSTS_PER_PAGE}&page=${page}&order=score`; // Ordered by score
  console.log(`Fetching ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Error fetching page ${page}: ${response.status} ${response.statusText}`);
      // Handle rate limits (e.g., check response headers like X-Retry-After)
      // For now, just throw
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    // Danbooru API returns an empty array when pages are exhausted
    if (Array.isArray(data) && data.length === 0) {
      console.log(`Page ${page} returned no posts. End of results?`);
      return null; // Signal end of data
    }
    return data;
  } catch (error) {
    console.error(`Failed to fetch page ${page}:`, error);
    return null; // Signal failure
  }
}

export async function acquireData() {
  const outputDir = "../danbooru_data";
  await fs.mkdir(outputDir, { recursive: true });

  for (let page = 1; page <= NUM_PAGES_TO_FETCH; page++) {
    const posts = await fetchDanbooruPosts(page);
    if (posts === null) {
      console.log("Stopping data acquisition.");
      break; // Stop if API returned no posts or failed
    }

    // Save posts to a file (optional, but good for large datasets)
    const filePath = path.join(outputDir, `posts_page_${page}.json`);
    await fs.writeFile(filePath, JSON.stringify(posts, null, 2));
    console.log(`Saved ${posts.length} posts from page ${page} to ${filePath}`);

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS)); // Wait before next request
  }
  console.log("Data acquisition complete.");
}
