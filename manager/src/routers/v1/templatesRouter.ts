import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import {
  postTemplates,
  postTypeEnum,
  InsertPostTemplate,
  SelectPostTemplate,
} from "@/schema";
import { PostType } from "@/schema";
import { requireUserId } from "@/utils/auth";

// Helper to generate unique IDs
const generateUniqueId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2, 15);

export const templatesRouter = new Elysia({ prefix: "/templates" })
  // GET all templates
  .get(
    "/",
    async ({
      set,
      request,
      db,
    }: {
      request: Request;
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { status: "error", message: "Authentication required." };
      if (!db) {
        console.error("DB binding not available.");
        set.status = 500;
        return { status: "error", message: "Server config error." };
      }

      try {
        const allTemplates: SelectPostTemplate[] = await db
          .select()
          .from(postTemplates)
          .where(eq(postTemplates.userId, userId))
          .orderBy(desc(postTemplates.updatedAt));

        set.status = 200;
        return {
          status: "success",
          message: "Templates fetched.",
          items: allTemplates,
        };
      } catch (error: any) {
        console.error(`Error fetching templates: ${error.message}`, error);
        set.status = 500;
        return { status: "error", message: "Internal server error." };
      }
    }
  )

  // GET single template by ID
  .get(
    "/:id",
    async ({
      params,
      set,
      request,
      db,
    }: {
      params: { id: string };
      request: Request;
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { status: "error", message: "Authentication required." };
      const templateId = params.id;

      if (!db) {
        console.error("DB binding not available.");
        set.status = 500;
        return { status: "error", message: "Server config error." };
      }

      if (!templateId) {
        set.status = 400;
        return { status: "error", message: "Template ID required." };
      }

      try {
        const template: SelectPostTemplate | undefined =
          await db.query.postTemplates.findFirst({
            where: and(eq(postTemplates.id, templateId), eq(postTemplates.userId, userId)),
          });

        if (!template) {
          set.status = 404;
          return { status: "error", message: "Template not found." };
        }

        set.status = 200;
        return {
          status: "success",
          message: "Template fetched.",
          item: template,
        };
      } catch (error: any) {
        console.error(
          `Error fetching template ${templateId}: ${error.message}`,
          error
        );
        set.status = 500;
        return { status: "error", message: "Internal server error." };
      }
    }
  )

  // CREATE new template
  .post(
    "/",
    async ({
      body,
      set,
      request,
      db,
    }: {
      body: any; // Define a more specific type if available
      request: Request;
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { status: "error", message: "Authentication required." };
      if (!db) {
        console.error("DB binding not available.");
        set.status = 500;
        return { status: "error", message: "Server config error." };
      }

      try {
        // Basic validation
        const { name, type, title, description, options, imageKeys } = body;

        if (!name || typeof name !== "string" || name.trim() === "") {
          set.status = 400;
          return { status: "error", message: "'name' required." };
        }
        if (
          !type ||
          typeof type !== "string" ||
          !(postTypeEnum as readonly string[]).includes(type)
        ) {
          set.status = 400;
          return { status: "error", message: "Invalid 'type'." };
        }
        if (!title || typeof title !== "string" || title.trim() === "") {
          set.status = 400;
          return { status: "error", message: "'title' required." };
        }
        if (description !== undefined && typeof description !== "string") {
          set.status = 400;
          return { status: "error", message: "'description' must be string." };
        }
        if (
          type === "poll" &&
          options !== undefined &&
          (!Array.isArray(options) ||
            !options.every((item: any) => typeof item === "string"))
        ) {
          set.status = 400;
          return {
            status: "error",
            message: "'options' must be array of strings for poll.",
          };
        }
        // Validate imageKeys if provided
        if (
          imageKeys !== undefined &&
          (!Array.isArray(imageKeys) ||
            !imageKeys.every((item: any) => typeof item === "string"))
        ) {
          set.status = 400;
          return {
            status: "error",
            message: "'imageKeys' must be an array of strings.",
          };
        }

        const newTemplate: InsertPostTemplate = {
          id: generateUniqueId(),
          userId,
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

        await db.insert(postTemplates).values(newTemplate);

        const createdTemplate: SelectPostTemplate | undefined =
          await db.query.postTemplates.findFirst({
            where: and(eq(postTemplates.id, newTemplate.id!), eq(postTemplates.userId, userId)),
          });

        set.status = 201;
        return {
          status: "success",
          message: "Template created.",
          item: createdTemplate || newTemplate,
        };
      } catch (error: any) {
        console.error(`Error creating template: ${error.message}`, error);
        set.status = 500;
        return { status: "error", message: "Internal server error." };
      }
    }
  )

  // REPLACE template (PUT) - requires all main fields in body
  .put(
    "/:id",
    async ({
      params,
      body,
      set,
      request,
      db,
    }: {
      params: { id: string };
      body: any; // Define a more specific type if available
      request: Request;
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { status: "error", message: "Authentication required." };
      const templateId = params.id;

      if (!db) {
        console.error("DB binding not available.");
        set.status = 500;
        return { status: "error", message: "Server config error." };
      }
      if (!templateId) {
        set.status = 400;
        return { status: "error", message: "Template ID required for update." };
      }

      try {
        // Strict validation for PUT: Requires ALL main fields
        const { name, type, title, description, options, imageKeys } = body;

        if (name === undefined || typeof name !== "string" || name.trim() === "") {
          set.status = 400;
          return { status: "error", message: "'name' required for PUT." };
        }
        if (
          type === undefined ||
          typeof type !== "string" ||
          !(postTypeEnum as readonly string[]).includes(type)
        ) {
          set.status = 400;
          return { status: "error", message: "Invalid 'type' for PUT." };
        }
        if (title === undefined || typeof title !== "string" || title.trim() === "") {
          set.status = 400;
          return { status: "error", message: "'title' required for PUT." };
        }
        if (description !== undefined && typeof description !== "string") {
          set.status = 400;
          return { status: "error", message: "'description' must be string." };
        }

        // Options validation:
        if (type === "poll") {
          if (
            options === undefined ||
            !Array.isArray(options) ||
            !options.every((item: any) => typeof item === "string")
          ) {
            set.status = 400;
            return {
              status: "error",
              message: "'options' must be array of strings when type is 'poll' for PUT.",
            };
          }
        } else {
          // Type is 'text'
          // For PUT text, options should be [] or valid array if provided
          if (
            options !== undefined &&
            (!Array.isArray(options) ||
              !options.every((item: any) => typeof item === "string"))
          ) {
            set.status = 400;
            return {
              status: "error",
              message: "'options' must be array of strings if provided (even for text).",
            };
          }
        }

        // ImageKeys validation: must be [] or valid array of strings if provided
        if (
          imageKeys !== undefined &&
          (!Array.isArray(imageKeys) ||
            !imageKeys.every((item: any) => typeof item === "string"))
        ) {
          set.status = 400;
          return {
            status: "error",
            message: "'imageKeys' must be an array of strings for PUT.",
          };
        }

        const updatedData: Partial<InsertPostTemplate> = {
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
          .where(and(eq(postTemplates.id, templateId), eq(postTemplates.userId, userId)));

        if (result.meta?.count === 0) {
          set.status = 404;
          return { status: "error", message: "Template not found." };
        }

        set.status = 200;
        return { status: "success", message: "Template updated." };
      } catch (error: any) {
        console.error(
          `Error updating template ${templateId} (PUT): ${error.message}`,
          error
        );
        set.status = 500;
        return { status: "error", message: "Internal server error." };
      }
    }
  )

  // PARTIAL UPDATE template (PATCH)
  .patch(
    "/:id",
    async ({
      params,
      body,
      set,
      request,
      db,
    }: {
      params: { id: string };
      body: any; // Define a more specific type if available
      request: Request;
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { status: "error", message: "Authentication required." };
      const templateId = params.id;

      if (!db) {
        console.error("DB binding not available.");
        set.status = 500;
        return { status: "error", message: "Server config error." };
      }
      if (!templateId) {
        set.status = 400;
        return { status: "error", message: "Template ID required for patch." };
      }

      try {
        const allowedFields = [
          "name",
          "type",
          "title",
          "description",
          "options",
          "imageKeys",
        ];
        const updateData: any = {};

        const existingTemplate: SelectPostTemplate | undefined =
          await db.query.postTemplates.findFirst({
            where: and(eq(postTemplates.id, templateId), eq(postTemplates.userId, userId)),
          });

        if (!existingTemplate) {
          set.status = 404;
          return { status: "error", message: "Template not found." };
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
                if (typeof body.name !== "string" || body.name.trim() === "") {
                  set.status = 400;
                  return { status: "error", message: "Invalid or empty 'name'." };
                }
                updateData.name = body.name.trim();
                break;
              case "type":
                if (
                  typeof body.type !== "string" ||
                  !(postTypeEnum as readonly string[]).includes(body.type)
                ) {
                  set.status = 400;
                  return { status: "error", message: "Invalid 'type'." };
                }
                updateData.type = body.type as (typeof postTypeEnum)[number];
                if (
                  updateData.type === "text" &&
                  existingTemplate.type === "poll" &&
                  body.options === undefined
                ) {
                  updateData.options = [];
                }
                break;
              case "title":
                if (typeof body.title !== "string" || body.title.trim() === "") {
                  set.status = 400;
                  return { status: "error", message: "Invalid or empty 'title'." };
                }
                updateData.title = body.title.trim();
                break;
              case "description":
                if (typeof body.description !== "string" && body.description !== null) {
                  set.status = 400;
                  return {
                    status: "error",
                    message: "'description' must be string or null.",
                  };
                }
                updateData.description =
                  body.description !== null ? body.description : "";
                break;
              case "options":
                if (finalType === "poll") {
                  if (
                    !Array.isArray(body.options) ||
                    !body.options.every((item: any) => typeof item === "string")
                  ) {
                    set.status = 400;
                    return {
                      status: "error",
                      message: "'options' must be array of strings.",
                    };
                  }
                  updateData.options = body.options
                    .map((opt: string) => opt.trim())
                    .filter((v: string) => v !== "");
                }
                break;
              case "imageKeys":
                if (
                  !Array.isArray(body.imageKeys) ||
                  !body.imageKeys.every((item: any) => typeof item === "string")
                ) {
                  set.status = 400;
                  return {
                    status: "error",
                    message: "'imageKeys' must be array of strings.",
                  };
                }
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
          set.status = 400;
          return { status: "error", message: "No valid fields for update." };
        }

        updateData.updatedAt = new Date().toISOString();

        const result = await db
          .update(postTemplates)
          .set(updateData)
          .where(and(eq(postTemplates.id, templateId), eq(postTemplates.userId, userId)));

        if (result.meta?.count === 0) {
          set.status = 404;
          return { status: "error", message: "Template not found during update." };
        }

        set.status = 200;
        return { status: "success", message: "Template updated partially." };
      } catch (error: any) {
        console.error(
          `Error updating template ${templateId} (PATCH): ${error.message}`,
          error
        );
        set.status = 500;
        return { status: "error", message: "Internal server error." };
      }
    }
  )

  // DELETE template
  .delete(
    "/:id",
    async ({
      params,
      set,
      request,
      db,
    }: {
      params: { id: string };
      request: Request;
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { status: "error", message: "Authentication required." };
      const templateId = params.id;

      if (!db) {
        console.error("DB binding not available.");
        set.status = 500;
        return { status: "error", message: "Server config error." };
      }

      if (!templateId) {
        set.status = 400;
        return { status: "error", message: "Template ID required for delete." };
      }

      try {
        const result = await db
          .delete(postTemplates)
          .where(and(eq(postTemplates.id, templateId), eq(postTemplates.userId, userId)));

        if (result.meta?.count === 0) {
          set.status = 404;
          return { status: "error", message: "Template not found." };
        }

        set.status = 200;
        return { status: "success", message: "Template deleted." };
      } catch (error: any) {
        console.error(
          `Error deleting template ${templateId}: ${error.message}`,
          error
        );
        set.status = 500;
        return { status: "error", message: "Internal server error." };
      }
    }
  );
