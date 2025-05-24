// src/services/PostService.ts
import { fetchPostsMethod, fetchPostByIdMethod } from "@/api/methods/posts"; // Assuming alovaMethods.ts is in the same directory
import db from "@/db";
import { scrapedPosts } from "@/schema/scrapedPosts"; // Import the schema
import { eq, max, desc } from "drizzle-orm"; // Drizzle operators

const POSTS_PER_PAGE = 100; // Max limit per page allowed by Danbooru
const MAX_NEW_POSTS_TO_ACQUIRE_PER_RUN = 1000; // Limit acquisition per run per run
const DELAY_MS = 500; // Delay between requests to respect rate limits

const PostService = {
  // State to track the highest post ID successfully loaded into our DB
  // This will be loaded from the DB on service initialization.
  _lastHighestPostIdLoaded: 0,

  /**
   * Loads the highest post ID currently present in our database.
   * This is crucial for incremental fetching.
   */
  async _loadInitialState() {
    console.log("Loading initial state: fetching highest post ID from DB...");
    try {
      const result = await db
        .select({ maxId: max(scrapedPosts.id) })
        .from(scrapedPosts)
        .limit(1);

      // If the table is empty, maxId will be null
      const highestId = result[0]?.maxId || 0;
      this._lastHighestPostIdLoaded = highestId;
      console.log(`Initial highest ID loaded from DB: ${this._lastHighestPostIdLoaded}`);
    } catch (error) {
      console.error("Failed to load highest post ID from DB:", error);
      // Depending on criticality, you might want to throw here or handle differently
      // For now, we'll proceed with 0, meaning it will fetch from the newest available
    }
  },

  /**
   * Stores a batch of posts into the database.
   * Uses onConflictDoNothing to handle duplicates, which can occur
   * when the fetched page contains a mix of new and old posts.
   * @param posts The array of post objects to store.
   * @returns The number of posts successfully inserted.
   */
  async _storePosts(posts: any[]): Promise<number> {
    if (posts.length === 0) {
      return 0;
    }

    // Map the incoming API data to the database schema structure
    const postsToInsert = posts.map((post) => {
      return {
        id: post.id as number,
        rating: post.rating as "g" | "e" | "q" | "s",
        tagStringGeneral: post.tag_string_general as string,
        createdAt: new Date(post.media_asset.created_at as number), // Convert timestamp string to Date object
        score: (post.up_score +
          (post.down_score < 0 ? post.down_score : -post.down_score)) as number,
        favCount: post.fav_count as number,
        fileExt: post.media_asset.file_ext as string,
        fileSize: post.media_asset.file_size as number,
        imageWidth: post.media_asset.image_width as number,
        imageHeight: post.media_asset.image_height as number,
      };
    });

    try {
      console.log(`Attempting to insert ${postsToInsert.length} posts into DB...`);
      // Use insert with onConflictDoNothing on the primary key (id)
      // and returning() to get the count of actual inserts (if supported by dialect)
      // For PostgreSQL, returning() returns the inserted rows.
      const insertedRows = await db
        .insert(scrapedPosts)
        .values(postsToInsert)
        .onConflictDoNothing({ target: scrapedPosts.id })
        .returning({ id: scrapedPosts.id }); // Return just the ID of inserted rows for counting

      const addedCount = insertedRows.length;
      console.log(`Successfully inserted ${addedCount} new posts into DB.`);
      return addedCount;
    } catch (error) {
      console.error("Failed to store posts in DB:", error);
      // Depending on error type, you might want to retry or stop
      throw error; // Re-throw the error to be caught by the acquisition process
    }
  },

  /**
   * Fetches new posts from Danbooru (ordered by id_desc),
   * stores them in the database, and stops when hitting
   * previously acquired data or a limit of new posts.
   */
  async acquireNewPosts() {
    let currentPage = 131;
    let newPostsAcquiredInRun = 0;
    let reachedExistingData = false;
    // Capture the highest ID known *before* this run starts from the DB
    const initialLastHighestId = this._lastHighestPostIdLoaded;
    // Track the highest ID encountered that is strictly greater than initialLastHighestId
    // This will be used to update _lastHighestPostIdLoaded after the run
    let highestNewIdSeenInRun = initialLastHighestId;

    console.log("Starting new post acquisition run.");
    console.log(`Initial highest ID loaded from DB: ${initialLastHighestId}`);
    console.log(`Maximum new posts to acquire this run: ${MAX_NEW_POSTS_TO_ACQUIRE_PER_RUN}`);

    while (newPostsAcquiredInRun < MAX_NEW_POSTS_TO_ACQUIRE_PER_RUN && !reachedExistingData) {
      console.log(`Fetching page ${currentPage} (order: id_desc, limit: ${POSTS_PER_PAGE})...`);
      try {
        // Use the alova method to fetch posts, ordered by descending ID
        const postsResponse = await fetchPostsMethod(POSTS_PER_PAGE, currentPage, "id_desc");

        if (!Array.isArray(postsResponse)) {
          console.error("API returned unexpected data format for posts list:", postsResponse);
          break; // Stop on unexpected response type
        }

        if (postsResponse.length === 0) {
          console.log(
            `Page ${currentPage} returned no posts. Reached end of API data or temporary issue.`,
          );
          break; // No more data available
        }

        const postsToProcess: unknown[] = [];

        // Iterate through the posts on the fetched page (ordered id_desc)
        // We expect IDs to be decreasing
        for (const post of postsResponse) {
          // **Crucial Check:** Stop processing this page if we find a post
          // whose ID is less than or equal to the highest ID we already have in our DB.
          if (post.id <= initialLastHighestId) {
            console.log(
              `Found post with ID ${post.id} <= initial highest ID (${initialLastHighestId}). Reached previously acquired data.`,
            );
            reachedExistingData = true;
            break; // Stop processing the current page; subsequent posts will also be old or older
          }
          // If the post is strictly newer, add it to the list to insert
          postsToProcess.push(post);
          // Update the highest ID encountered so far in THIS run that is NEW
          highestNewIdSeenInRun = Math.max(highestNewIdSeenInRun, post.id);
        }

        // Store the new posts found on this page (up to where we stopped if old data was found)
        if (postsToProcess.length > 0) {
          const addedCount = await this._storePosts(postsToProcess); // Use DB store helper
          newPostsAcquiredInRun += addedCount; // Add the count of successfully inserted posts

          console.log(
            `Attempted to process ${postsToProcess.length} new posts from page ${currentPage}, successfully stored ${addedCount}. Total new in run: ${newPostsAcquiredInRun}`,
          );
        } else if (reachedExistingData) {
          // If postsToProcess was empty but reachedExistingData is true,
          // it means the very first post on the page was old.
          console.log("Page starts with old data, stopping fetch.");
          // `reachedExistingData` is already true, loop will terminate.
        } else {
          // This case is unlikely with id_desc unless there's an API anomaly
          console.log(
            `Page ${currentPage} processed, but no new posts identified to store. Continuing...`,
          );
        }
        const shouldContinue =
          !reachedExistingData &&
          newPostsAcquiredInRun < MAX_NEW_POSTS_TO_ACQUIRE_PER_RUN &&
          postsResponse.length > 0 &&
          postsToProcess.length > 0; // Only fetch next page if we found *potential* new posts on this one

        if (shouldContinue) {
          currentPage++;
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS)); // Wait before next request
        } else {
          console.log("Stopping fetch loop based on conditions.");
        }
      } catch (error: unknown) {
        // Catch errors during fetch or store
        console.error(`Failed during acquisition process on page ${currentPage}:`, error);
        // Implement more sophisticated error handling here if needed (retries, specific status codes like 429)
        if (Error.isError(error)) {
          console.log(error);
          // console.warn(
          // 	"Rate limited (Status 429). Consider increasing DELAY_MS or implementing retry-after logic.",
          // );
        }
        break; // Stop acquisition on error
      }
    }

    if (highestNewIdSeenInRun > initialLastHighestId) {
      this._lastHighestPostIdLoaded = highestNewIdSeenInRun;
      console.log(
        `Acquisition run finished. Updated service's highest processed ID from ${initialLastHighestId} to ${this._lastHighestPostIdLoaded}.`,
      );
    } else {
      console.log(
        `Acquisition run finished. No new posts stored or highest ID did not increase from ${initialLastHighestId}.`,
      );
    }

    console.log(
      `Acquisition process concluded. Total new posts acquired in this run: ${newPostsAcquiredInRun}.`,
    );
    // You could add a log here showing the total count in the DB, but that requires another DB query.
    // console.log(`Total posts in DB (approx): [Fetch from DB]`);
  },

  /**
   * Fetches a single post by its ID directly from the Danbooru API.
   * Useful for inspecting the full data structure before deciding what to store.
   * Does NOT store the post in the database.
   * @param postId The ID of the post to fetch.
   * @returns The post data object from the API or null if not found/failed.
   */
  async getPostByIdFromApi(postId: number): Promise<any | null> {
    console.log(`Attempting to fetch post by ID from API: ${postId}`);
    try {
      // Use the alova method to fetch the single post
      const post = await fetchPostByIdMethod(postId).send();

      // Danbooru API for a single post might return an empty object {}
      // or an object indicating error if not found (e.g. { "success": false, "reason": "not found" }).
      // Check if the response is a valid object with data and not an error indicator.
      if (post && typeof post === "object" && Object.keys(post).length > 0) {
        console.log(`Successfully fetched post ${postId} from API.`);
        return post; // Return the raw API response
      }
      console.log(
        `Post with ID ${postId} not found on API or API returned unexpected format/error.`,
      );
      return null;
    } catch (error) {
      console.error(`Failed to fetch post by ID ${postId} from API:`, error);
      return null; // Signal failure
    }
  },

  /**
   * Fetches a single post from your local database by its ID.
   * @param postId The ID of the post to fetch.
   * @returns The post data object from the database or null if not found.
   */
  async getPostByIdFromDb(postId: number) {
    console.log(`Attempting to fetch post by ID from DB: ${postId}`);
    try {
      const post = await db.select().from(scrapedPosts).where(eq(scrapedPosts.id, postId)).limit(1);

      if (post.length > 0) {
        console.log(`Successfully fetched post ${postId} from DB.`);
        return post[0]; // Return the first result
      }
      console.log(`Post with ID ${postId} not found in DB.`);
      return null;
    } catch (error) {
      console.error(`Failed to fetch post by ID ${postId} from DB:`, error);
      return null;
    }
  },
};

(async () => {
  await PostService._loadInitialState();
  // console.log(JSON.stringify(await PostService.getPostByIdFromApi(8750077), null, 4));
})();

export default PostService;
