import db from "@/db";
import { scrapedPosts, tags } from "@/schema";
import Elysia, { t } from "elysia";

const PostDataSchema = t.Object({
  id: t.Number(),
  tagString: t.Union([t.String(), t.Null()]), // Matches scrapedPosts.tagStringGeneral type
});

export const dataRouter = new Elysia({ prefix: "/data", name: "dataRouter" }).get(
  "/",
  async ({ set }) => {
    try {
      console.log("API: Received request for /data");

      // Select ID and tagStringGeneral directly from the scrapedPosts table
      const rawPostData = await db
        .select({
          id: scrapedPosts.id,
          tagString: scrapedPosts.tagStringGeneral,
        })
        .from(scrapedPosts)
        .execute(); // Use .execute()

      console.log(`API: Fetched ${rawPostData.length} posts with tag strings.`);

      // Return the raw data. Elysia handles JSON serialization.
      set.status = 200;
      return rawPostData;
    } catch (error) {
      console.error("API Error fetching data:", error);
      set.status = 500;
      return {
        status: "ERROR",
        message: "Failed to fetch data from database.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  },
  {
    response: {
      200: t.Array(PostDataSchema),
      500: t.Object({
        status: t.Literal("ERROR"),
        message: t.String(),
        details: t.String(),
      }),
    },
  },
);
