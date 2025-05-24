import db from "@/db";
import { categories, categoryTag, relationshipWeights, scrapedPosts, tags } from "@/schema";

// await db.delete(categories);
await db.delete(relationshipWeights);
// await db.delete(tags);
