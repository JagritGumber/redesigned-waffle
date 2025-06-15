import { Elysia, t } from "elysia";
import { s3 } from "bun";
import db from "@/db";
import { PostService } from "@/services/postService"; // Import the new service
import { postImageDetails, SelectPostImageDetails } from "@/schema/postImageDetails"; // Import postImageDetails schema
import { generatorJobs } from "@/schema/generatorJob"; // Import generatorJobs schema
import { eq } from "drizzle-orm";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import axios from "axios"; // Import axios to fetch image data

const postService = new PostService(); // Instantiate the service

// Helper function to convert a URL to a GoogleGenerativeAI.Part
async function fileToGenerativePart(url: string) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const mimeType = response.headers["content-type"];
    const base64Data = Buffer.from(response.data).toString("base64");
    return {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };
  } catch (error) {
    console.error(`Error fetching or converting image from URL: ${url}`, error);
    throw new Error(`Failed to process image from URL: ${url}`);
  }
}

async function generateImageDetails(
  prompt: string,
  imageUrl: string,
  currentTitle?: string,
  currentDescription?: string,
  currentTags?: string[],
  forceRegenerate?: boolean
) {
  const apiKey = Bun.env.GOOGLE_API_KEY; // Use Google API Key

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set in environment variables.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Use Gemini Pro Vision

  let userPromptText = `User Image Prompt: "${prompt}"`;
  if (!forceRegenerate) {
    if (currentTitle) {
      userPromptText += `\nExisting Title: "${currentTitle}"`;
    }
    if (currentDescription) {
      userPromptText += `\nExisting Description: "${currentDescription}"`;
    }
    if (currentTags && currentTags.length > 0) {
      userPromptText += `\nExisting Tags: "${currentTags.join(", ")}"`;
    }
  }

  const systemPrompt = `You are an AI assistant and a creator who is creating content for himself, as an NSFW artist. Your task is to generate brief, direct, and character-focused post details (title, description, and tags) for an image based on a user-provided prompt. If existing details are provided, enhance them. The output should be in JSON format. Avoid overly poetic or abstract language; focus on concrete details about the character and scene.


Instructions:
1.  **Title**: Create a very brief, catchy title (max 10 words) that directly relates to the character or main subject. If an existing title is provided, enhance it or generate a new one if it's too generic or poetic. Examples: "Blonde Maid Enjoying", "Yellow-Haired Maid", "Adventurer in Forest".
2.  **Description**: Write a very brief, descriptive summary (max 30 words) that highlights the character's actions, appearance, or the immediate scene. If an existing description is provided, enhance it. Focus on what is visually present.
3.  **Tags**: Generate 3-5 relevant, comma-separated tags that are specific to the character, their attributes, or the scene. If existing tags are provided, add to them or refine them.

Example Output:
{
  "title": "Blonde Maid Enjoying",
  "description": "A cheerful blonde maid with a white apron, enjoying a sunny afternoon in a cozy kitchen.",
  "tags": "maid, blonde hair, apron, kitchen, happy"
}
`;

  const imagePart = await fileToGenerativePart(imageUrl);

  const generationConfig = {
    temperature: 0.9,
    topP: 1,
    topK: 1,
    maxOutputTokens: 2048,
  };

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ];

  try {
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + `\n\n${userPromptText}` }, imagePart] },
      ],
      generationConfig,
      safetySettings,
    });
    const response = result.response;
    const content = response.text();

    // Extract JSON content from the response
    const jsonStartIndex = content.indexOf("{");
    const jsonEndIndex = content.lastIndexOf("}");
    let jsonString = content;

    if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
      jsonString = content.substring(jsonStartIndex, jsonEndIndex + 1);
    } else {
      // If no valid JSON block is found, try to clean up common prefixes
      jsonString = content
        .replace(/^```json\s*/, "")
        .replace(/^```\s*/, "")
        .trim();
      if (jsonString.startsWith("DeepInfra Raw Response:")) {
        jsonString = jsonString.substring("DeepInfra Raw Response:".length).trim();
      }
      if (jsonString.startsWith("Here's a generated post detail for the given prompt:")) {
        jsonString = jsonString
          .substring("Here's a generated post detail for the given prompt:".length)
          .trim();
      }
      // Remove leading/trailing backticks if present
      if (jsonString.startsWith("```") && jsonString.endsWith("```")) {
        jsonString = jsonString.substring(3, jsonString.length - 3).trim();
      }
    }

    // Attempt to parse the JSON response
    const parsedContent = JSON.parse(jsonString);

    return {
      title: parsedContent.title || `Generated Title for: ${prompt.substring(0, 20)}...`,
      description:
        parsedContent.description || `Generated Description for: ${prompt.substring(0, 50)}...`,
      tags: parsedContent.tags
        ? parsedContent.tags.split(",").map((tag: string) => tag.trim())
        : [],
    };
  } catch (error) {
    console.error("Error generating image details with DeepInfra:", error);
    const title = `AI Generated Image: ${prompt.substring(0, 30)}${
      prompt.length > 30 ? "..." : ""
    }`;
    const description = `This image was generated based on the prompt: "${prompt}".`;
    const tags = prompt
      .split(" ")
      .filter(Boolean)
      .slice(0, 5)
      .map((tag) => tag.toLowerCase());
    return { title, description, tags };
  }
}

export const imageRouter = new Elysia({ prefix: "/images" })
  .post(
    "/generate-and-save-post-details",
    async ({ body, set }) => {
      const { imageId, currentTitle, currentDescription, currentTags, forceRegenerate } = body;

      if (!db) {
        set.status = 500;
        return { status: "error", message: "Server configuration error: Database not available." };
      }

      try {
        // 1. Fetch the image job to get the prompt
        const imageJob = await db.query.generatorJobs.findFirst({
          where: (jobs, { eq }) => eq(jobs.id, imageId),
        });

        if (!imageJob || !imageJob.inputPayload?.prompt || !imageJob.imageKey) {
          set.status = 404;
          return {
            status: "error",
            message: "Image not found, prompt, or image key not available.",
          };
        }

        const imageUrl = `${Bun.env.HOST_URL}/api/v1/images/${encodeURIComponent(
          imageJob.imageKey.slice(imageJob.imageKey.indexOf("generator"))
        )}`;

        // 2. Generate details using AI
        const { title, description, tags } = await generateImageDetails(
          imageJob.inputPayload.prompt,
          imageUrl,
          forceRegenerate ? undefined : currentTitle,
          forceRegenerate ? undefined : currentDescription,
          forceRegenerate ? undefined : currentTags
        );

        // 3. Check if details already exist for this imageId
        const existingDetails = await db.query.postImageDetails.findFirst({
          where: (details, { eq }) => eq(details.id, imageId),
        });

        let savedDetails: SelectPostImageDetails[];
        if (existingDetails) {
          // Update existing details
          savedDetails = await db
            .update(postImageDetails)
            .set({
              title,
              description,
              tags,
              updatedAt: new Date(),
            })
            .where(eq(postImageDetails.id, imageId))
            .returning();
          console.log(`Updated post details for image ${imageId}`);
        } else {
          // Insert new details
          savedDetails = await db
            .insert(postImageDetails)
            .values({
              id: imageId, // Use imageId as the primary key 'id'
              platform: "deviantart", // Default platform
              title,
              description,
              tags,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          console.log(`Saved new post details for image ${imageId}`);
        }

        set.status = 200;
        return {
          status: "success",
          message: "Generated and saved post details.",
          data: savedDetails.at(0),
        };
      } catch (error: any) {
        console.error(`Error in /generate-and-save-post-details endpoint: ${error.message}`, error);
        set.status = 500;
        return {
          status: "error",
          message: "Internal server error during AI generation and saving.",
          error: error.message,
        };
      }
    },
    {
      body: t.Object({
        imageId: t.String(),
        currentTitle: t.Optional(t.String()),
        currentDescription: t.Optional(t.String()),
        currentTags: t.Optional(t.Array(t.String())),
        forceRegenerate: t.Optional(t.Boolean()), // Add forceRegenerate to the body schema
      }),
    }
  )
  .put(
    "/post-details",
    async ({ body, set }) => {
      const { imageId, title, description, tags, platform, tier } = body;

      if (!db) {
        set.status = 500;
        return { status: "error", message: "Server configuration error: Database not available." };
      }

      try {
        const existingDetails = await db.query.postImageDetails.findFirst({
          where: (details, { eq }) => eq(details.id, imageId),
        });

        let savedDetails: SelectPostImageDetails[];
        if (existingDetails) {
          savedDetails = await db
            .update(postImageDetails)
            .set({
              title,
              description,
              tags,
              platform,
              tier,
              updatedAt: new Date(),
            })
            .where(eq(postImageDetails.id, imageId))
            .returning();
          console.log(`Updated post details for image ${imageId}`);
        } else {
          savedDetails = await db
            .insert(postImageDetails)
            .values({
              id: imageId,
              title,
              description,
              tags,
              platform: platform || "deviantart", // Default if not provided
              tier,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          console.log(`Saved new post details for image ${imageId}`);
        }

        set.status = 200;
        return {
          status: "success",
          message: "Post details saved successfully.",
          data: savedDetails.at(0),
        };
      } catch (error: any) {
        console.error(`Error in /post-details PUT endpoint: ${error.message}`, error);
        set.status = 500;
        return {
          status: "error",
          message: "Internal server error during saving post details.",
          error: error.message,
        };
      }
    },
    {
      body: t.Object({
        imageId: t.String(),
        title: t.String(),
        description: t.String(),
        tags: t.Optional(t.Array(t.String())),
        platform: t.Optional(t.Union([t.Literal("deviantart"), t.Literal("patreon")])),
        tier: t.Optional(t.String()),
      }),
    }
  )
  .get("/post-details/:imageId", async ({ params, set }) => {
    const { imageId } = params;

    if (!db) {
      set.status = 500;
      return { status: "error", message: "Server configuration error: Database not available." };
    }

    try {
      const existingDetails = await db.query.postImageDetails.findFirst({
        where: (details, { eq }) => eq(details.id, imageId),
      });

      if (existingDetails) {
        set.status = 200;
        return {
          status: "success",
          message: "Post details fetched successfully.",
          data: existingDetails,
        };
      } else {
        // If no existing details, generate and save new ones
        const imageJob = await db.query.generatorJobs.findFirst({
          where: (jobs, { eq }) => eq(jobs.id, imageId),
        });

        if (!imageJob || !imageJob.inputPayload?.prompt || !imageJob.imageKey) {
          set.status = 404;
          return {
            status: "error",
            message: "Image not found, prompt, or image key not available for generation.",
          };
        }

        const imageUrl = `${Bun.env.HOST_URL}/api/v1/images/${encodeURIComponent(
          imageJob.imageKey.slice(imageJob.imageKey.indexOf("generator"))
        )}`;

        const { title, description, tags } = await generateImageDetails(
          imageJob.inputPayload.prompt,
          imageUrl
        );

        const newDetails = await db
          .insert(postImageDetails)
          .values({
            id: imageId,
            platform: "deviantart", // Default platform
            title,
            description,
            tags,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        set.status = 200;
        return {
          status: "success",
          message: "Generated and saved new post details.",
          data: newDetails.at(0),
        };
      }
    } catch (error: any) {
      console.error(`Error in /post-details GET endpoint: ${error.message}`, error);
      set.status = 500;
      return {
        status: "error",
        message: "Internal server error during fetching post details.",
        error: error.message,
      };
    }
  })
  .get("/:key", async ({ params, set }) => {
    const key = params.key;
    if (!key) {
      set.status = 400;
      return "Missing image key.";
    }
    try {
      const object = s3.file(key, {
        accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
        endpoint: Bun.env.R2_PUBLIC_BUCKET_URL,
        bucket: Bun.env.R2_BUCKET_NAME,
        secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
      });
      const stat = await object.stat();

      if (!object) {
        set.status = 404;
        return "Not Found";
      }

      const contentType = stat.type || "application/octet-stream";
      const cacheControl = "public, max-age=86400";

      set.status = 200;
      set.headers["Content-Type"] = contentType;
      set.headers["Cache-Control"] = cacheControl;
      set.headers["ETag"] = stat.etag;
      set.headers["Last-Modified"] = stat.lastModified.toUTCString();
      return await object.bytes();
    } catch (error: any) {
      console.error(`Error fetching object ${key} from R2: ${error.message}`, error);
      set.status = 500;
      return "Internal server error fetching image.";
    }
  })
  .get(
    "/gallery/:id",
    async ({ params, query, set }) => {
      const jobId = params.id; // Get the ID from the URL path
      // Expect query.status to be a string or an array of strings
      const statusQuery = query.status;
      const statusFilter = Array.isArray(statusQuery)
        ? statusQuery
        : typeof statusQuery === "string"
        ? [statusQuery]
        : undefined; // If not provided, no filter

      if (!db) {
        console.error("Server configuration error: Database binding not available.");
        set.status = 500;
        return {
          status: "error",
          message: "Server configuration error: Database not available.",
        };
      }

      if (!jobId) {
        console.error("Missing job ID in request path.");
        set.status = 400;
        return { status: "error", message: "Job ID is required." };
      }

      try {
        // 1. Fetch the target job
        const targetJob = await db.query.generatorJobs.findFirst({
          where: (jobs, { and, eq, isNotNull, inArray }) =>
            and(
              eq(jobs.id, jobId),
              statusFilter ? inArray(jobs.status, statusFilter) : undefined, // Apply status filter only if present
              isNotNull(jobs.imageKey) // Ensure it's an image we can view
            ),
        });

        if (!targetJob) {
          console.warn(`Target job not found or does not meet criteria for ID: ${jobId}`);
          set.status = 404;
          return { status: "error", message: "Job not found or not viewable." };
        }

        const targetCreatedAt = targetJob.createdAt;

        // 2. Fetch jobs *after* the target (which have an *earlier* createdAt in DESC order)
        const jobsAfter = await db.query.generatorJobs.findMany({
          where: (jobs, { and, lt, isNotNull, inArray }) =>
            and(
              lt(jobs.createdAt, targetCreatedAt), // Earlier timestamp
              statusFilter ? inArray(jobs.status, statusFilter) : undefined, // Apply status filter only if present
              isNotNull(jobs.imageKey) // Ensure it's viewable
            ),
          orderBy: (jobs, { desc }) => desc(jobs.createdAt), // Same sort order as gallery
        });

        // 3. Fetch jobs *before* the target (which have a *later* createdAt in DESC order)
        // We need to fetch them in ASC order by createdAt to get the "latest" ones before the target easily
        const jobsBefore = await db.query.generatorJobs.findMany({
          where: (jobs, { and, gt, isNotNull, inArray }) =>
            and(
              gt(jobs.createdAt, targetCreatedAt), // Later timestamp
              statusFilter ? inArray(jobs.status, statusFilter) : undefined, // Apply status filter only if present
              isNotNull(jobs.imageKey) // Ensure it's viewable
            ),
          orderBy: (jobs, { asc }) => asc(jobs.createdAt), // Need ASC here
        });

        // 4. Combine results: jobsBefore (reversed), targetJob, jobsAfter
        // jobsBefore were fetched ASC, so reverse to put them before target in DESC order view
        const combinedJobs = [...jobsBefore.reverse(), targetJob, ...jobsAfter];

        // Find the index of the target job in the combined list
        const initialIndex = combinedJobs.findIndex((job) => job.id === targetJob.id);

        console.log(
          `Fetched ${jobsBefore.length} jobs before, ${jobsAfter.length} jobs after for ID ${jobId}. Combined: ${combinedJobs.length}`
        );

        set.status = 200;
        return {
          status: "success",
          message: "Successfully fetched job details and neighbors.",
          items: combinedJobs, // Return the array of jobs
          initialIndex: initialIndex, // Return the index of the current job
        };
      } catch (error: any) {
        console.error(
          `API Handler unexpected error fetching job ${jobId} with neighbors: ${error.message}`,
          error
        );
        set.status = 500;
        return {
          status: "error",
          message: "Internal server error while fetching job details and neighbors.",
          error: error.message,
        };
      }
    },
    {
      query: t.Object({
        status: t.Array(
          t.Union([
            t.Literal("COMPLETED"),
            t.Literal("PENDING"),
            t.Literal("RUNNING"),
            t.Literal("FAILED"),
            t.Literal("WEBHOOK_RECEIVED"),
            t.Literal("CANCELLED"),
          ])
        ),
      }),
    }
  )
  .post(
    "/scrape-and-post",
    async ({ body, set }) => {
      const { imageId, platform, tier } = body; // Only expect imageId, platform, and tier
      console.log(`Received request to scrape and post image: ${imageId} to ${platform}`);

      if (!db) {
        set.status = 500;
        return { status: "error", message: "Server configuration error: Database not available." };
      }

      try {
        // Fetch image details from the database
        const imageJob = await db.query.generatorJobs.findFirst({
          where: (jobs, { eq }) => eq(jobs.id, imageId),
        });

        if (!imageJob || !imageJob.imageKey) {
          set.status = 404;
          return { status: "error", message: "Image not found or no image key available." };
        }

        // Fetch the saved post details from the database
        const savedPostDetails = await db.query.postImageDetails.findFirst({
          where: (details, { eq }) => eq(details.id, imageId),
        });

        if (!savedPostDetails) {
          set.status = 404;
          return { status: "error", message: "No saved post details found for this image." };
        }

        // Construct the full image URL
        const imageUrl = `${Bun.env.HOST_URL}/api/v1/images/${encodeURIComponent(
          imageJob.imageKey.slice(imageJob.imageKey.indexOf("generator"))
        )}`;

        // Use the fetched details for posting, overriding platform/tier if provided in body
        const success = await postService.postImage(
          imageUrl,
          platform || savedPostDetails.platform, // Use provided platform or saved one
          savedPostDetails.title,
          savedPostDetails.description,
          savedPostDetails.tags || [], // Ensure tags is always an array
          tier || savedPostDetails.tier || undefined // Ensure tier is string or undefined
        );

        if (success) {
          set.status = 200;
          return {
            status: "success",
            message: `Scrape and post initiated for image ID: ${imageId} to ${platform}.`,
          };
        } else {
          set.status = 500;
          return {
            status: "error",
            message: `Failed to post image ID: ${imageId} to ${platform}. Check server logs.`,
          };
        }
      } catch (error: any) {
        console.error(`Error in /scrape-and-post endpoint: ${error.message}`, error);
        set.status = 500;
        return {
          status: "error",
          message: "Internal server error during scrape and post.",
          error: error.message,
        };
      }
    },
    {
      body: t.Object({
        imageId: t.String(),
        platform: t.Optional(t.Union([t.Literal("deviantart"), t.Literal("patreon")])), // Now optional
        tier: t.Optional(t.String()), // New optional tier field
      }),
    }
  )
  .delete("/:id", async ({ params, set }) => {
    const imageId = params.id;

    if (!db) {
      set.status = 500;
      return { status: "error", message: "Server configuration error: Database not available." };
    }

    try {
      // 1. Find the image job to get the imageKey for R2 deletion
      const imageJob = await db.query.generatorJobs.findFirst({
        where: (jobs, { eq }) => eq(jobs.id, imageId),
      });

      if (!imageJob) {
        set.status = 404;
        return { status: "error", message: "Image not found." };
      }

      // 2. Delete from R2 if imageKey exists
      if (imageJob.imageKey) {
        try {
          const objectKey = imageJob.imageKey.slice(imageJob.imageKey.indexOf("generator"));
          await s3.delete(objectKey, {
            accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
            endpoint: Bun.env.R2_PUBLIC_BUCKET_URL,
            bucket: Bun.env.R2_BUCKET_NAME,
            secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
          });
          console.log(`Deleted image ${objectKey} from R2.`);
        } catch (r2Error: any) {
          console.error(`Error deleting image from R2: ${r2Error.message}`, r2Error);
          // Continue with database deletion even if R2 deletion fails
        }
      }

      // 3. Delete from the database
      await db.delete(generatorJobs).where(eq(generatorJobs.id, imageId));
      await db.delete(postImageDetails).where(eq(postImageDetails.id, imageId)); // Also delete associated post details

      console.log(`Image ${imageId} and its post details deleted from database.`);

      set.status = 200;
      return { status: "success", message: "Image deleted successfully." };
    } catch (error: any) {
      console.error(`Error deleting image ${imageId}: ${error.message}`, error);
      set.status = 500;
      return { status: "error", message: "Internal server error during image deletion." };
    }
  });
