// src/api/v1/templates.ts

import { ContextForHono } from "@/types/context"; // Adjust the import path
import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import {
  postTemplates,
  postTypeEnum,
  InsertPostTemplate,
  SelectPostTemplate,
} from "@/schema"; // Import updated schema types
import { PostType } from "@/schema";

// Helper to generate unique IDs
const generateUniqueId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2, 15);

const templatesRouter = new Hono<ContextForHono>()
  // GET all templates
  .get("/", async (c) => {
    const db = c.get("db");

    if (!db) {
      console.error("DB binding not available.");
      return c.json({ status: "error", message: "Server config error." }, 500);
    }

    try {
      const allTemplates: SelectPostTemplate[] = await db
        .select()
        .from(postTemplates)
        .orderBy(desc(postTemplates.updatedAt));

      return c.json({
        status: "success",
        message: "Templates fetched.",
        items: allTemplates,
      });
    } catch (error: any) {
      console.error(`Error fetching templates: ${error.message}`, error);
      return c.json(
        { status: "error", message: "Internal server error." },
        500
      );
    }
  })

  // GET single template by ID
  .get("/:id", async (c) => {
    const db = c.get("db");
    const templateId = c.req.param("id");

    if (!db) {
      console.error("DB binding not available.");
      return c.json({ status: "error", message: "Server config error." }, 500);
    }

    if (!templateId) {
      return c.json({ status: "error", message: "Template ID required." }, 400);
    }

    try {
      const template: SelectPostTemplate | undefined =
        await db.query.postTemplates.findFirst({
          where: eq(postTemplates.id, templateId),
        });

      if (!template) {
        return c.json({ status: "error", message: "Template not found." }, 404);
      }

      return c.json({
        status: "success",
        message: "Template fetched.",
        item: template,
      });
    } catch (error: any) {
      console.error(
        `Error fetching template ${templateId}: ${error.message}`,
        error
      );
      return c.json(
        { status: "error", message: "Internal server error." },
        500
      );
    }
  })

  // CREATE new template
  .post("/", async (c) => {
    const db = c.get("db");

    if (!db) {
      console.error("DB binding not available.");
      return c.json({ status: "error", message: "Server config error." }, 500);
    }

    try {
      const body = await c.req.json();

      // Basic validation
      const { name, type, title, description, options, imageKeys } = body;

      if (!name || typeof name !== "string" || name.trim() === "")
        return c.json({ status: "error", message: "'name' required." }, 400);
      if (
        !type ||
        typeof type !== "string" ||
        !(postTypeEnum as readonly string[]).includes(type)
      )
        return c.json({ status: "error", message: "Invalid 'type'." }, 400);
      if (!title || typeof title !== "string" || title.trim() === "")
        return c.json({ status: "error", message: "'title' required." }, 400);
      if (description !== undefined && typeof description !== "string")
        return c.json(
          { status: "error", message: "'description' must be string." },
          400
        );
      if (
        type === "poll" &&
        options !== undefined &&
        (!Array.isArray(options) ||
          !options.every((item) => typeof item === "string"))
      )
        return c.json(
          {
            status: "error",
            message: "'options' must be array of strings for poll.",
          },
          400
        );
      // Validate imageKeys if provided
      if (
        imageKeys !== undefined &&
        (!Array.isArray(imageKeys) ||
          !imageKeys.every((item) => typeof item === "string"))
      )
        return c.json(
          {
            status: "error",
            message: "'imageKeys' must be an array of strings.",
          },
          400
        );

      const now = new Date().toISOString();

      const newTemplate: InsertPostTemplate = {
        id: generateUniqueId(),
        name: name.trim(),
        type: type as (typeof postTypeEnum)[number],
        title: title.trim(),
        description: description !== undefined ? description : "",
        options:
          type === "poll" && Array.isArray(options)
            ? options.map((opt: string) => opt.trim()).filter((v) => v !== "")
            : [], // Filter empty, ensure [] for non-polls
        imageKeys: Array.isArray(imageKeys)
          ? imageKeys.map((key: string) => key.trim()).filter((v) => v !== "")
          : [], // <<< Include image keys, filter empty, ensure [] if not array
      };

      await db.insert(postTemplates).values(newTemplate);

      // D1 insert might not return the full object easily, fetch it or return payload
      // Fetching ensures all DB defaults/transforms are included
      const createdTemplate: SelectPostTemplate | undefined =
        await db.query.postTemplates.findFirst({
          where: eq(postTemplates.id, newTemplate.id!),
        });

      return c.json(
        {
          status: "success",
          message: "Template created.",
          item: createdTemplate || newTemplate, // Return fetched or original payload
        },
        201
      );
    } catch (error: any) {
      console.error(`Error creating template: ${error.message}`, error);
      return c.json(
        { status: "error", message: "Internal server error." },
        500
      );
    }
  })

  // REPLACE template (PUT) - requires all main fields in body
  .put("/:id", async (c) => {
    const db = c.get("db");
    const templateId = c.req.param("id");

    if (!db) {
      console.error("DB binding not available.");
      return c.json({ status: "error", message: "Server config error." }, 500);
    }
    if (!templateId) {
      return c.json(
        { status: "error", message: "Template ID required for update." },
        400
      );
    }

    try {
      const body = await c.req.json();

      // Strict validation for PUT: Requires ALL main fields
      const { name, type, title, description, options, imageKeys } = body;

      if (name === undefined || typeof name !== "string" || name.trim() === "")
        return c.json(
          { status: "error", message: "'name' required for PUT." },
          400
        );
      if (
        type === undefined ||
        typeof type !== "string" ||
        !(postTypeEnum as readonly string[]).includes(type)
      )
        return c.json(
          { status: "error", message: "Invalid 'type' for PUT." },
          400
        );
      if (
        title === undefined ||
        typeof title !== "string" ||
        title.trim() === ""
      )
        return c.json(
          { status: "error", message: "'title' required for PUT." },
          400
        );
      if (description !== undefined && typeof description !== "string")
        return c.json(
          { status: "error", message: "'description' must be string." },
          400
        );

      // Options validation:
      if (type === "poll") {
        if (
          options === undefined ||
          !Array.isArray(options) ||
          !options.every((item) => typeof item === "string")
        ) {
          return c.json(
            {
              status: "error",
              message:
                "'options' must be array of strings when type is 'poll' for PUT.",
            },
            400
          );
        }
      } else {
        // Type is 'text'
        // For PUT text, options should be [] or valid array if provided
        if (
          options !== undefined &&
          (!Array.isArray(options) ||
            !options.every((item) => typeof item === "string"))
        )
          return c.json(
            {
              status: "error",
              message:
                "'options' must be array of strings if provided (even for text).",
            },
            400
          );
      }

      // ImageKeys validation: must be [] or valid array of strings if provided
      if (
        imageKeys !== undefined &&
        (!Array.isArray(imageKeys) ||
          !imageKeys.every((item) => typeof item === "string"))
      )
        return c.json(
          {
            status: "error",
            message: "'imageKeys' must be an array of strings for PUT.",
          },
          400
        );

      const now = new Date().toISOString();

      const updatedData: Partial<InsertPostTemplate> = {
        // Use Partial as id/createdAt are not included
        name: name.trim(),
        type: type as (typeof postTypeEnum)[number],
        title: title.trim(),
        description: description !== undefined ? description : "",
        options:
          type === "poll" && Array.isArray(options)
            ? options.map((opt: string) => opt.trim()).filter((v) => v !== "")
            : [],
        imageKeys: Array.isArray(imageKeys)
          ? imageKeys.map((key: string) => key.trim()).filter((v) => v !== "")
          : [],
      };

      const result = await db
        .update(postTemplates)
        .set(updatedData)
        .where(eq(postTemplates.id, templateId));

      if (result.meta?.count === 0) {
        return c.json({ status: "error", message: "Template not found." }, 404);
      }

      return c.json({ status: "success", message: "Template updated." }, 200);
    } catch (error: any) {
      console.error(
        `Error updating template ${templateId} (PUT): ${error.message}`,
        error
      );
      return c.json(
        { status: "error", message: "Internal server error." },
        500
      );
    }
  })

  // PARTIAL UPDATE template (PATCH)
  .patch("/:id", async (c) => {
    const db = c.get("db");
    const templateId = c.req.param("id");

    if (!db) {
      console.error("DB binding not available.");
      return c.json({ status: "error", message: "Server config error." }, 500);
    }
    if (!templateId) {
      return c.json(
        { status: "error", message: "Template ID required for patch." },
        400
      );
    }

    try {
      const body = await c.req.json();
      const allowedFields = [
        "name",
        "type",
        "title",
        "description",
        "options",
        "imageKeys",
      ]; // <<< Added imageKeys
      const updateData: any = {};

      const existingTemplate: SelectPostTemplate | undefined =
        await db.query.postTemplates.findFirst({
          where: eq(postTemplates.id, templateId),
        });

      if (!existingTemplate) {
        return c.json({ status: "error", message: "Template not found." }, 404);
      }

      const finalType: PostType =
        body.type !== undefined &&
        (postTypeEnum as readonly string[]).includes(body.type)
          ? (body.type as PostType)
          : existingTemplate.type;

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          switch (field) {
            case "name":
              if (typeof body.name !== "string" || body.name.trim() === "")
                return c.json(
                  { status: "error", message: "Invalid or empty 'name'." },
                  400
                );
              updateData.name = body.name.trim();
              break;
            case "type":
              if (
                typeof body.type !== "string" ||
                !(postTypeEnum as readonly string[]).includes(body.type)
              )
                return c.json(
                  { status: "error", message: "Invalid 'type'." },
                  400
                );
              updateData.type = body.type as (typeof postTypeEnum)[number];
              // If type changes from poll to text, clear options unless options are also provided
              if (
                updateData.type === "text" &&
                existingTemplate.type === "poll" &&
                body.options === undefined
              ) {
                updateData.options = [];
              }
              break;
            case "title":
              if (typeof body.title !== "string" || body.title.trim() === "")
                return c.json(
                  { status: "error", message: "Invalid or empty 'title'." },
                  400
                );
              updateData.title = body.title.trim();
              break;
            case "description":
              if (
                typeof body.description !== "string" &&
                body.description !== null
              )
                return c.json(
                  {
                    status: "error",
                    message: "'description' must be string or null.",
                  },
                  400
                );
              updateData.description =
                body.description !== null ? body.description : "";
              break;
            case "options":
              if (finalType === "poll") {
                // Only apply options update if target type is poll
                if (
                  !Array.isArray(body.options) ||
                  !body.options.every((item: any) => typeof item === "string")
                )
                  return c.json(
                    {
                      status: "error",
                      message: "'options' must be array of strings.",
                    },
                    400
                  );
                updateData.options = body.options
                  .map((opt: string) => opt.trim())
                  .filter((v: string) => v !== "");
              }
              // If finalType is 'text', ignore options from body unless explicitly setting to [] or null
              break;
            case "imageKeys": // <<< Handle imageKeys in PATCH
              if (
                !Array.isArray(body.imageKeys) ||
                !body.imageKeys.every((item: any) => typeof item === "string")
              )
                return c.json(
                  {
                    status: "error",
                    message: "'imageKeys' must be array of strings.",
                  },
                  400
                );
              updateData.imageKeys = body.imageKeys
                .map((key: string) => key.trim())
                .filter((v: string) => v !== "");
              break;
            default:
              console.warn(`Ignoring unknown field in PATCH: ${field}`);
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        return c.json(
          { status: "error", message: "No valid fields for update." },
          400
        );
      }

      updateData.updatedAt = new Date().toISOString();

      const result = await db
        .update(postTemplates)
        .set(updateData)
        .where(eq(postTemplates.id, templateId));

      if (result.meta?.count === 0) {
        return c.json(
          { status: "error", message: "Template not found during update." },
          404
        );
      }

      return c.json(
        { status: "success", message: "Template updated partially." },
        200
      );
    } catch (error: any) {
      console.error(
        `Error updating template ${templateId} (PATCH): ${error.message}`,
        error
      );
      return c.json(
        { status: "error", message: "Internal server error." },
        500
      );
    }
  })

  // DELETE template
  .delete("/:id", async (c) => {
    const db = c.get("db");
    const templateId = c.req.param("id");

    if (!db) {
      console.error("DB binding not available.");
      return c.json({ status: "error", message: "Server config error." }, 500);
    }

    if (!templateId) {
      return c.json(
        { status: "error", message: "Template ID required for delete." },
        400
      );
    }

    try {
      const result = await db
        .delete(postTemplates)
        .where(eq(postTemplates.id, templateId));

      if (result.meta?.count === 0) {
        return c.json({ status: "error", message: "Template not found." }, 404);
      }

      return c.json({ status: "success", message: "Template deleted." }, 200);
    } catch (error: any) {
      console.error(
        `Error deleting template ${templateId}: ${error.message}`,
        error
      );
      return c.json(
        { status: "error", message: "Internal server error." },
        500
      );
    }
  });

export default templatesRouter;
