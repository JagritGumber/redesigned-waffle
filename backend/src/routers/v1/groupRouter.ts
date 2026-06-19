// ./v1/groupRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { accounts, groups } from "@/schema";
import { and, eq, aliasedTable } from "drizzle-orm";
import { verifyAuth } from "@hono/auth-js";
import { getRequiredUserId } from "@/utils/auth";

const groupRouter = new Hono<ContextForHono>()
    .use("*", async (c, next) => {
        if (c.req.path.includes("/connect/patreon/callback") || c.req.path.includes("/connect/deviantart/callback")) {
            return next();
        }
        return verifyAuth()(c, next);
    })
    .post("/", async (c) => {
        try {
            const db = c.get("db");
            const userId = getRequiredUserId(c);
            if (!userId) {
                return c.json({ message: "Authentication required." }, 401);
            }
            const { name } = await c.req.json<{ name: string }>();
            const newGroup = await db
                .insert(groups)
                .values({
                    name: name,
                    userId,
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
            const userId = getRequiredUserId(c);
            if (!userId) {
                return c.json({ message: "Authentication required." }, 401);
            }

            const deviantartAccounts = aliasedTable(accounts, "deviantart_accounts");

            const allGroupsWithRelations = await db
                .select({
                    group: groups,
                    patreonAccount: accounts,
                    deviantartAccount: deviantartAccounts,
                })
                .from(groups)
                .leftJoin(accounts, eq(groups.patreonAccountId, accounts.id))
                .leftJoin(deviantartAccounts, eq(groups.deviantartAccountId, deviantartAccounts.id))
                .where(eq(groups.userId, userId));

            if (allGroupsWithRelations && allGroupsWithRelations.length > 0) {
                const groupsWithNestedRelations = allGroupsWithRelations.map((row) => ({
                    ...row.group,
                    patreonAccount: row.patreonAccount?.id ? row.patreonAccount : null,
                    deviantartAccount: row.deviantartAccount?.id ? row.deviantartAccount : null,
                }));

                // Function to refresh Patreon token if needed
                const refreshPatreonToken = async (account: typeof accounts.$inferSelect) => {
                    if (!account?.refresh_token) return null;
                    try {
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
                                    grant_type: "refresh_token",
                                    refresh_token: account.refresh_token,
                                    client_id: c.env.ONE_CLIENT_ID,
                                    client_secret: c.env.ONE_CLIENT_SECRET,
                                }),
                            }
                        );

                        if (!tokenResponse.ok) {
                            console.error("Patreon Token Refresh Error:", await tokenResponse.text());
                            return null;
                        }

                        const tokenData = (await tokenResponse.json()) as {
                            access_token: string;
                            refresh_token?: string; // Refresh token might not always be returned
                            expires_in: number; // Expected to be in seconds
                        };

                        await db
                            .update(accounts)
                            .set({
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token || account.refresh_token, // Use new if available, otherwise keep the old one
                                expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
                            })
                            .where(and(eq(accounts.id, account.id), eq(accounts.userId, userId)));
                        return tokenData.access_token;
                    } catch (error) {
                        console.error("Error refreshing Patreon token:", error);
                        return null;
                    }
                };

                // Function to refresh DeviantArt token if needed
                const refreshDeviantArtToken = async (account: typeof accounts.$inferSelect) => {
                    if (!account?.refresh_token) return null;
                    try {
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
                                    grant_type: "refresh_token",
                                    refresh_token: account.refresh_token,
                                    client_id: c.env.TWO_CLIENT_ID,
                                    client_secret: c.env.TWO_CLIENT_SECRET,
                                }),
                            }
                        );

                        if (!tokenResponse.ok) {
                            console.error("DeviantArt Token Refresh Error:", await tokenResponse.text());
                            return null;
                        }

                        const tokenData = (await tokenResponse.json()) as {
                            access_token: string;
                            refresh_token: string;
                            expires_in: number; // Expected to be in seconds
                        };

                        await db
                            .update(accounts)
                            .set({
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token,
                                expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
                            })
                            .where(and(eq(accounts.id, account.id), eq(accounts.userId, userId)));
                        return tokenData.access_token;
                    } catch (error) {
                        console.error("Error refreshing DeviantArt token:", error);
                        return null;
                    }
                };

                // Iterate through groups and refresh tokens if needed
                for (const group of groupsWithNestedRelations) {
                    if (group.patreonAccountId && group.patreonAccount) {
                        // Convert the Unix timestamp (in seconds) to milliseconds
                        const expiresAt = group.patreonAccount.expires_at;
                        if (expiresAt) {
                            const nowSeconds = Math.floor(Date.now() / 1000);
                            const timeUntilExpiry = expiresAt - nowSeconds;
                            const daysUntilExpiry = timeUntilExpiry / (60 * 60 * 24);

                            // Check if the token is close to expiring (e.g., less than 2 days remaining)
                            if (daysUntilExpiry < 2) {
                                await refreshPatreonToken(group.patreonAccount);
                            }
                        }
                    }

                    if (group.deviantartAccountId && group.deviantartAccount) {
                        const expiresAt = group.deviantartAccount.expires_at;
                        if (expiresAt) {
                            const nowSeconds = Math.floor(Date.now() / 1000);
                            const timeUntilExpiry = expiresAt - nowSeconds;
                            const daysUntilExpiry = timeUntilExpiry / (60 * 60 * 24);

                            // Assuming DeviantArt tokens also have a similar expiry, refresh if close
                            if (daysUntilExpiry < 2) {
                                await refreshDeviantArtToken(group.deviantartAccount);
                            }
                        }
                    }
                }

                // Re-fetch the groups with potentially updated tokens (you could optimize this)
                const updatedGroupsResult = await db
                    .select({
                        group: groups,
                        patreonAccount: accounts,
                        deviantartAccount: deviantartAccounts,
                        
                    })
                    .from(groups)
                    .leftJoin(accounts, eq(groups.patreonAccountId, accounts.id))
                    .leftJoin(deviantartAccounts, eq(groups.deviantartAccountId, deviantartAccounts.id))
                    .where(eq(groups.userId, userId));

                const updatedGroupsWithNestedRelations = updatedGroupsResult.map((row) => ({
                    ...row.group,
                    patreonAccount: row.patreonAccount?.id ? row.patreonAccount : null,
                    deviantartAccount: row.deviantartAccount?.id ? row.deviantartAccount : null,
                }));

                return c.json(
                    { message: "Groups get successfully", groups: updatedGroupsWithNestedRelations },
                    200
                );
            } else {
                return c.json({ message: "No groups found" }, 200);
            }
        } catch (error) {
            console.error("Error getting groups:", error);
            return c.json(
                {
                    message: "Failed to get groups",
                    error: error instanceof Error ? error.message : JSON.stringify(error),
                },
                500
            );
        }
    })
    .patch("/:id", async (c) => {
        try {
            const db = c.get("db");
            const userId = getRequiredUserId(c);
            if (!userId) {
                return c.json({ message: "Authentication required." }, 401);
            }
            const id = c.req.param("id");
            const { name } = await c.req.json<{ name: string }>();

            const updatedGroup = await db
                .update(groups)
                .set({ name: name })
                .where(and(eq(groups.id, id), eq(groups.userId, userId)))
                .returning();

            if (updatedGroup && updatedGroup.length > 0) {
                return c.json({ message: "Group updated successfully", group: updatedGroup[0] }, 200);
            } else {
                return c.json({ message: `Group with ID ${id} not found` }, 404);
            }
        } catch (error) {
            console.error(`Error updating group with ID ${c.req.param("id")}:`, error);
            return c.json(
                {
                    message: `Failed to update group with ID ${c.req.param("id")}`,
                    error: error instanceof Error ? error.message : JSON.stringify(error),
                },
                500
            );
        }
    })
    .delete("/:id", async (c) => {
        try {
            const db = c.get("db");
            const userId = getRequiredUserId(c);
            if (!userId) {
                return c.json({ message: "Authentication required." }, 401);
            }
            const id = c.req.param("id");

            const deletedGroup = await db
                .delete(groups)
                .where(and(eq(groups.id, id), eq(groups.userId, userId)))
                .returning();

            if (deletedGroup && deletedGroup.length > 0) {
                return c.json({ message: `Group with ID ${id} deleted successfully`, group: deletedGroup[0] }, 200);
            } else {
                return c.json({ message: `Group with ID ${id} not found` }, 404);
            }
        } catch (error) {
            console.error(`Error deleting group with ID ${c.req.param("id")}:`, error);
            return c.json(
                {
                    message: `Failed to delete group with ID ${c.req.param("id")}`,
                    error: error instanceof Error ? error.message : JSON.stringify(error),
                },
                500
            );
        }
    })
    .get("/connect/patreon/callback", async (c) => {
        const code = c.req.query("code");
        const state = c.req.query("state"); // userId:groupId
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
                        client_id: c.env.ONE_CLIENT_ID,
                        client_secret: c.env.ONE_CLIENT_SECRET,
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
                expires_in: number;
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
            const [userId, groupId] = state?.split(":") ?? [];
            if (!userId || !groupId) {
                return c.text("Group ID not provided in the state.", 400);
            }

            const existingAccount = await db
                .select()
                .from(accounts)
                .where(
                    and(
                        eq(accounts.provider, "patreon"),
                        eq(accounts.providerAccountId, patreonUserId),
                        eq(accounts.userId, userId)
                    )
                )
                .limit(1);
            let patreonAccountId: number | undefined;

            const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

            if (existingAccount.length === 0) {
                const newAccount = await db
                    .insert(accounts)
                    .values({
                        provider: "patreon",
                        providerAccountId: patreonUserId,
                        userId,
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        type: "oauth",
                        expires_at: expiresAt,
                    })
                    .returning({ id: accounts.id });
                patreonAccountId = newAccount[0]?.id;
            } else {
                patreonAccountId = existingAccount[0]?.id;
                // Update tokens if account exists
                await db
                    .update(accounts)
                    .set({
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        expires_at: expiresAt,
                    })
                    .where(and(eq(accounts.id, patreonAccountId), eq(accounts.userId, userId)));
            }

            // --- Step 4: Update the group with the Patreon account ID ---
            if (patreonAccountId) {
                await db
                    .update(groups)
                    .set({ patreonAccountId: patreonAccountId })
                    .where(and(eq(groups.id, groupId), eq(groups.userId, userId)));
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
        const state = c.req.query("state"); // userId:groupId
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
                        client_id: c.env.TWO_CLIENT_ID,
                        client_secret: c.env.TWO_CLIENT_SECRET,
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
                expires_in: number;
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
            const [userId, groupId] = state?.split(":") ?? [];
            if (!userId || !groupId) {
                return c.text("Group ID not provided in the state.", 400);
            }

            const existingAccount = await db
                .select()
                .from(accounts)
                .where(
                    and(
                        eq(accounts.provider, "deviantart"),
                        eq(accounts.providerAccountId, deviantartUserId),
                        eq(accounts.userId, userId)
                    )
                )
                .limit(1);
            let deviantartAccountId: number | undefined;

            const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

            if (existingAccount.length === 0) {
                const newAccount = await db
                    .insert(accounts)
                    .values({
                        provider: "deviantart",
                        providerAccountId: deviantartUserId,
                        userId,
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        type: "oauth",
                        expires_at: expiresAt,
                    })
                    .returning({ id: accounts.id });
                deviantartAccountId = newAccount[0]?.id;
            } else {
                deviantartAccountId = existingAccount[0]?.id;
                // Update tokens if account exists
                await db
                    .update(accounts)
                    .set({
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        expires_at: expiresAt,
                    })
                    .where(and(eq(accounts.id, deviantartAccountId), eq(accounts.userId, userId)));
            }

            // --- Step 4: Update the group with the DeviantArt account ID ---
            if (deviantartAccountId) {
                await db
                    .update(groups)
                    .set({ deviantartAccountId: deviantartAccountId })
                    .where(and(eq(groups.id, groupId), eq(groups.userId, userId)));
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
    })
    .get("/connect/patreon/:id", async (c) => {
        const groupId = c.req.param("id");
        const userId = getRequiredUserId(c);
        if (!userId) {
            return c.json({ message: "Authentication required." }, 401);
        }
        const db = c.get("db");
        const group = await db.query.groups.findFirst({
            where: and(eq(groups.id, groupId), eq(groups.userId, userId)),
            columns: { id: true },
        });
        if (!group) {
            return c.json({ message: `Group with ID ${groupId} not found` }, 404);
        }
        const clientId = c.env.ONE_CLIENT_ID;
        const redirectUri = `${c.env.PROD_URL}/api/v1/group/connect/patreon/callback`;
        const scope = "identity";
        const state = `${userId}:${groupId}`;

        const authUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
        )}&scope=${encodeURIComponent(scope)}&state=${state}`;

        return c.json({ authUrl });
    })
    .get("/connect/deviantart/:id", async (c) => {
        const groupId = c.req.param("id");
        const userId = getRequiredUserId(c);
        if (!userId) {
            return c.json({ message: "Authentication required." }, 401);
        }
        const db = c.get("db");
        const group = await db.query.groups.findFirst({
            where: and(eq(groups.id, groupId), eq(groups.userId, userId)),
            columns: { id: true },
        });
        if (!group) {
            return c.json({ message: `Group with ID ${groupId} not found` }, 404);
        }
        const clientId = c.env.TWO_CLIENT_ID;
        const redirectUri = `${c.env.PROD_URL}/api/v1/group/connect/deviantart/callback`;
        const responseType = "code";
        const scope = "user";
        const state = `${userId}:${groupId}`;

        const authUrl = `https://www.deviantart.com/oauth2/authorize?response_type=${responseType}&client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
        )}&scope=${encodeURIComponent(scope)}&state=${state}`;

        return c.json({ authUrl });
    })

export default groupRouter;
