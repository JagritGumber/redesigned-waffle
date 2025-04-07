// ./v1/groupRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { accounts, groups } from "@/schema";
import { and, eq } from "drizzle-orm";

const groupRouter = new Hono<ContextForHono>()
  .post("/", async (c) => {
    try {
      const db = c.get("db");
      const { name } = await c.req.json<{ name: string }>();
      const newGroup = await db
        .insert(groups)
        .values({
          name: name,
        })
        .returning();

      if (newGroup && newGroup.length > 0) {
        return c.json(
          { message: "Group created successfully", group: newGroup[0] },
          201
        );
      } else {
        return c.json({ message: "Failed to create group" }, 500);
      }
    } catch (error) {
      console.error("Error creating group:", error);
      return c.json(
        {
          message: "Failed to create group",
          error: error instanceof Error ? error.message : JSON.stringify(error),
        },
        500
      );
    }
  })
  .get("/", async (c) => {
    try {
      const db = c.get("db");
      const allGroups = await db.select().from(groups);

      if (allGroups && allGroups.length > 0) {
        return c.json(
          { message: "Groups get successfully", groups: allGroups },
          200
        );
      } else {
        return c.json({ message: "Failed to get groups" }, 500);
      }
    } catch (error) {
      console.error("Error creating group:", error);
      return c.json(
        {
          message: "Failed to get groups",
          error: error instanceof Error ? error.message : JSON.stringify(error),
        },
        500
      );
    }
  })
  .get("/connect/patreon/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state"); // Should contain the groupId
    const db = c.get("db");

    if (!code) {
      return c.text("Failed to get Patreon authorization code.", 400);
    }

    try {
      // --- Step 1: Exchange code for access token ---
      const tokenResponse = await fetch(
        "https://www.patreon.com/api/oauth2/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(
              `${c.env.ONE_CLIENT_ID}:${c.env.ONE_CLIENT_SECRET}`
            )}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: code,
            redirect_uri: `http://127.0.0.1:8787/api/v1/group/connect/patreon/callback`,
          }),
        }
      );

      if (!tokenResponse.ok) {
        console.error("Patreon Token Error:", await tokenResponse.text());
        return c.text("Failed to exchange Patreon code for token.", 500);
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token: string;
      };

      // --- Step 2: Get Patreon user info ---
      const userResponse = await fetch(
        "https://www.patreon.com/api/oauth2/v2/identity",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      if (!userResponse.ok) {
        console.error("Patreon User Info Error:", await userResponse.text());
        return c.text("Failed to get Patreon user information.", 500);
      }

      const userData = (await userResponse.json()) as { data: { id: string } };
      const patreonUserId = userData.data.id;

      // --- Step 3: Find or create account for the group ---
      const groupId = state;
      if (!groupId) {
        return c.text("Group ID not provided in the state.", 400);
      }

      const existingAccount = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.provider, "patreon"),
            eq(accounts.providerAccountId, patreonUserId)
          )
        )
        .limit(1);
      let patreonAccountId: number | undefined;

      if (existingAccount.length === 0) {
        const newAccount = await db
          .insert(accounts)
          .values({
            provider: "patreon",
            providerAccountId: patreonUserId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            type: "oauth",
          })
          .returning({ id: accounts.id });
        patreonAccountId = newAccount[0]?.id;
      } else {
        patreonAccountId = existingAccount[0]?.id;
      }

      // --- Step 4: Update the group with the Patreon account ID ---
      if (patreonAccountId) {
        await db
          .update(groups)
          .set({ patreonAccountId: patreonAccountId })
          .where(eq(groups.id, groupId));
        return c.html(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Patreon Connected</title>
                    </head>
                    <body>
                        <script>
                            window.opener.postMessage('patreon_connected', 'http://127.0.0.1:8787');
                            window.close();
                        </script>
                    </body>
                    </html>
                `); // Redirect to the group's page
      } else {
        return c.text("Failed to link Patreon account to group.", 500);
      }
    } catch (error) {
      console.error("Error during Patreon OAuth callback:", error);
      return c.text("Error connecting Patreon.", 500);
    }
  })
  // DeviantArt Callback (similar structure)
  .get("/connect/deviantart/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state"); // Should contain the groupId
    const db = c.get("db");

    if (!code) {
      return c.text("Failed to get DeviantArt authorization code.", 400);
    }

    try {
      // --- Step 1: Exchange code for access token ---
      const tokenResponse = await fetch(
        "https://www.deviantart.com/oauth2/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(
              `${c.env.TWO_CLIENT_ID}:${c.env.TWO_CLIENT_SECRET}`
            )}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: code,
            redirect_uri: `http://127.0.0.1:8787/api/v1/group/connect/deviantart/callback`,
          }),
        }
      );

      if (!tokenResponse.ok) {
        console.error("DeviantArt Token Error:", await tokenResponse.text());
        return c.text("Failed to exchange DeviantArt code for token.", 500);
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token: string;
      };

      // --- Step 2: Get DeviantArt user info ---
      const userResponse = await fetch(
        "https://www.deviantart.com/api/v1/oauth2/user/whoami",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      if (!userResponse.ok) {
        console.error("DeviantArt User Info Error:", await userResponse.text());
        return c.text("Failed to get DeviantArt user information.", 500);
      }

      const userData = (await userResponse.json()) as {
        userid: string;
      };
      const deviantartUserId = userData.userid;

      // --- Step 3: Find or create account for the group ---
      const groupId = state;
      if (!groupId) {
        return c.text("Group ID not provided in the state.", 400);
      }

      const existingAccount = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.provider, "deviantart"),
            eq(accounts.providerAccountId, deviantartUserId)
          )
        )
        .limit(1);
      let deviantartAccountId: number | undefined;

      if (existingAccount.length === 0) {
        const newAccount = await db
          .insert(accounts)
          .values({
            provider: "deviantart",
            providerAccountId: deviantartUserId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            type: "oauth",
          })
          .returning({ id: accounts.id });
        deviantartAccountId = newAccount[0]?.id;
      } else {
        deviantartAccountId = existingAccount[0]?.id;
      }

      // --- Step 4: Update the group with the DeviantArt account ID ---
      if (deviantartAccountId) {
        await db
          .update(groups)
          .set({ deviantartAccountId: deviantartAccountId })
          .where(eq(groups.id, groupId));
        return c.html(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Deviantart Connected</title>
                    </head>
                    <body>
                        <script>
                            window.opener.postMessage('deviantart_connected', 'http://127.0.0.1:8787');
                            window.close();
                        </script>
                    </body>
                    </html>
                `); // Redirect to the group's page
      } else {
        return c.text("Failed to link DeviantArt account to group.", 500);
      }
    } catch (error) {
      console.error("Error during DeviantArt OAuth callback:", error);
      return c.text("Error connecting DeviantArt.", 500);
    }
  });

export default groupRouter;
