import { Elysia, t } from "elysia";
import { accounts, groups } from "@/schema"; // Assuming schema path is relative to manager/src
import { and, eq, aliasedTable } from "drizzle-orm"; // Import sql

export const groupRouter = new Elysia({ prefix: "/group" })
  .post(
    "/",
    async ({
      body,
      set,
      db,
    }: {
      body: { name: string };
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      try {
        const { name } = body;
        const newGroup = await db
          .insert(groups)
          .values({
            name: name,
          })
          .returning();

        if (newGroup && newGroup.length > 0) {
          set.status = 201;
          return { message: "Group created successfully", group: newGroup[0] };
        } else {
          set.status = 500;
          return { message: "Failed to create group" };
        }
      } catch (error: any) {
        console.error("Error creating group:", error);
        set.status = 500;
        return {
          message: "Failed to create group",
          error: error instanceof Error ? error.message : JSON.stringify(error),
        };
      }
    }
  )
  .get(
    "/",
    async ({
      set,
      db,
      env,
    }: {
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
      env: {
        ONE_CLIENT_ID: string;
        ONE_CLIENT_SECRET: string;
        TWO_CLIENT_ID: string;
        TWO_CLIENT_SECRET: string;
        PROD_URL: string;
      };
    }) => {
      try {
        const deviantartAccounts = aliasedTable(accounts, "deviantart_accounts");

        const allGroupsWithRelations = await db
          .select({
            group: groups,
            patreonAccount: accounts,
            deviantartAccount: deviantartAccounts,
          })
          .from(groups)
          .leftJoin(accounts, eq(groups.patreonAccountId, accounts.id))
          .leftJoin(deviantartAccounts, eq(groups.deviantartAccountId, deviantartAccounts.id));

        if (allGroupsWithRelations && allGroupsWithRelations.length > 0) {
          const groupsWithNestedRelations = allGroupsWithRelations.map((row: any) => ({
            ...row.group,
            patreonAccount: row.patreonAccount?.id ? row.patreonAccount : null,
            deviantartAccount: row.deviantartAccount?.id ? row.deviantartAccount : null,
          }));

          // Function to refresh Patreon token if needed
          const refreshPatreonToken = async (account: typeof accounts.$inferSelect) => {
            if (!account?.refresh_token) return null;
            try {
              const tokenResponse = await fetch("https://www.patreon.com/api/oauth2/token", {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${btoa(`${env.ONE_CLIENT_ID}:${env.ONE_CLIENT_SECRET}`)}`,
                },
                body: new URLSearchParams({
                  grant_type: "refresh_token",
                  refresh_token: account.refresh_token,
                  client_id: env.ONE_CLIENT_ID,
                  client_secret: env.ONE_CLIENT_SECRET,
                }),
              });

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
                .where(eq(accounts.id, account.id));
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
              const tokenResponse = await fetch("https://www.deviantart.com/oauth2/token", {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${btoa(`${env.TWO_CLIENT_ID}:${env.TWO_CLIENT_SECRET}`)}`,
                },
                body: new URLSearchParams({
                  grant_type: "refresh_token",
                  refresh_token: account.refresh_token,
                  client_id: env.TWO_CLIENT_ID,
                  client_secret: env.TWO_CLIENT_SECRET,
                }),
              });

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
                .where(eq(accounts.id, account.id));
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
            .leftJoin(deviantartAccounts, eq(groups.deviantartAccountId, deviantartAccounts.id));

          const updatedGroupsWithNestedRelations = updatedGroupsResult.map((row: any) => ({
            ...row.group,
            patreonAccount: row.patreonAccount?.id ? row.patreonAccount : null,
            deviantartAccount: row.deviantartAccount?.id ? row.deviantartAccount : null,
          }));

          set.status = 200;
          return { message: "Groups get successfully", groups: updatedGroupsWithNestedRelations };
        } else {
          set.status = 200;
          return { message: "No groups found" };
        }
      } catch (error: any) {
        console.error("Error getting groups:", error);
        set.status = 500;
        return {
          message: "Failed to get groups",
          error: error instanceof Error ? error.message : JSON.stringify(error),
        };
      }
    }
  )
  .patch(
    "/:id",
    async ({
      params,
      body,
      set,
      db,
    }: {
      params: { id: string };
      body: { name: string };
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      try {
        const id = params.id;
        const { name } = body;

        const updatedGroup = await db
          .update(groups)
          .set({ name: name })
          .where(eq(groups.id, id))
          .returning();

        if (updatedGroup && updatedGroup.length > 0) {
          set.status = 200;
          return { message: "Group updated successfully", group: updatedGroup[0] };
        } else {
          set.status = 404;
          return { message: `Group with ID ${id} not found` };
        }
      } catch (error: any) {
        console.error(`Error updating group with ID ${params.id}:`, error);
        set.status = 500;
        return {
          message: `Failed to update group with ID ${params.id}`,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        };
      }
    }
  )
  .delete(
    "/:id",
    async ({
      params,
      set,
      db,
    }: {
      params: { id: string };
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
    }) => {
      try {
        const id = params.id;

        const deletedGroup = await db.delete(groups).where(eq(groups.id, id)).returning();

        if (deletedGroup && deletedGroup.length > 0) {
          set.status = 200;
          return { message: `Group with ID ${id} deleted successfully`, group: deletedGroup[0] };
        } else {
          set.status = 404;
          return { message: `Group with ID ${id} not found` };
        }
      } catch (error: any) {
        console.error(`Error deleting group with ID ${params.id}:`, error);
        set.status = 500;
        return {
          message: `Failed to delete group with ID ${params.id}`,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        };
      }
    }
  )
  .get(
    "/connect/patreon/callback",
    async ({
      query,
      set,
      db,
      env,
    }: {
      query: { code?: string; state?: string };
      set: { status: number | undefined; headers: Record<string, string> };
      db: any; // Replace 'any' with your actual Drizzle DB type
      env: {
        ONE_CLIENT_ID: string;
        ONE_CLIENT_SECRET: string;
        PROD_URL: string;
      };
    }) => {
      const code = query.code;
      const state = query.state; // Should contain the groupId

      if (!code) {
        set.status = 400;
        return "Failed to get Patreon authorization code.";
      }

      try {
        // --- Step 1: Exchange code for access token ---
        const tokenResponse = await fetch("https://www.patreon.com/api/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${env.ONE_CLIENT_ID}:${env.ONE_CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: code,
            redirect_uri: `http://127.0.0.1:8787/api/v1/group/connect/patreon/callback`, // This should ideally use env.PROD_URL
            client_id: env.ONE_CLIENT_ID,
            client_secret: env.ONE_CLIENT_SECRET,
          }),
        });

        if (!tokenResponse.ok) {
          console.error("Patreon Token Error:", await tokenResponse.text());
          set.status = 500;
          return "Failed to exchange Patreon code for token.";
        }

        const tokenData = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        // --- Step 2: Get Patreon user info ---
        const userResponse = await fetch("https://www.patreon.com/api/oauth2/v2/identity", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        if (!userResponse.ok) {
          console.error("Patreon User Info Error:", await userResponse.text());
          set.status = 500;
          return "Failed to get Patreon user information.";
        }

        const userData = (await userResponse.json()) as { data: { id: string } };
        const patreonUserId = userData.data.id;

        // --- Step 3: Find or create account for the group ---
        const groupId = state;
        if (!groupId) {
          set.status = 400;
          return "Group ID not provided in the state.";
        }

        const existingAccount = await db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.provider, "patreon"), eq(accounts.providerAccountId, patreonUserId))
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
          if (patreonAccountId) {
            await db
              .update(accounts)
              .set({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: expiresAt,
              })
              .where(eq(accounts.id, patreonAccountId));
          } else {
            console.error("Patreon account ID is undefined after lookup.");
            set.status = 500;
            return "Failed to link Patreon account to group: Account ID missing.";
          }
        }

        // --- Step 4: Update the group with the Patreon account ID ---
        if (patreonAccountId) {
          await db
            .update(groups)
            .set({ patreonAccountId: patreonAccountId })
            .where(eq(groups.id, groupId));
          set.headers["Content-Type"] = "text/html";
          return `
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
        `; // Redirect to the group's page
        } else {
          set.status = 500;
          return "Failed to link Patreon account to group.";
        }
      } catch (error: any) {
        console.error("Error during Patreon OAuth callback:", error);
        set.status = 500;
        return "Error connecting Patreon.";
      }
    }
  )
  // DeviantArt Callback (similar structure)
  .get(
    "/connect/deviantart/callback",
    async ({
      query,
      set,
      db,
      env,
    }: {
      query: { code?: string; state?: string };
      set: { status: number | undefined; headers: Record<string, string> };
      db: any; // Replace 'any' with your actual Drizzle DB type
      env: {
        TWO_CLIENT_ID: string;
        TWO_CLIENT_SECRET: string;
        PROD_URL: string;
      };
    }) => {
      const code = query.code;
      const state = query.state; // Should contain the groupId

      if (!code) {
        set.status = 400;
        return "Failed to get DeviantArt authorization code.";
      }

      try {
        // --- Step 1: Exchange code for access token ---
        const tokenResponse = await fetch("https://www.deviantart.com/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${env.TWO_CLIENT_ID}:${env.TWO_CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: code,
            redirect_uri: `http://127.0.0.1:8787/api/v1/group/connect/deviantart/callback`, // This should ideally use env.PROD_URL
            client_id: env.TWO_CLIENT_ID,
            client_secret: env.TWO_CLIENT_SECRET,
          }),
        });

        if (!tokenResponse.ok) {
          console.error("DeviantArt Token Error:", await tokenResponse.text());
          set.status = 500;
          return "Failed to exchange DeviantArt code for token.";
        }

        const tokenData = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        // --- Step 2: Get DeviantArt user info ---
        const userResponse = await fetch("https://www.deviantart.com/api/v1/oauth2/user/whoami", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        if (!userResponse.ok) {
          console.error("DeviantArt User Info Error:", await userResponse.text());
          set.status = 500;
          return "Failed to get DeviantArt user information.";
        }

        const userData = (await userResponse.json()) as {
          userid: string;
        };
        const deviantartUserId = userData.userid;

        // --- Step 3: Find or create account for the group ---
        const groupId = state;
        if (!groupId) {
          set.status = 400;
          return "Group ID not provided in the state.";
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

        const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

        if (existingAccount.length === 0) {
          const newAccount = await db
            .insert(accounts)
            .values({
              provider: "deviantart",
              providerAccountId: deviantartUserId,
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
          if (deviantartAccountId) {
            // Ensure deviantartAccountId is not undefined before updating
            const accountIdToUpdate: number = deviantartAccountId; // Explicitly type as number
            await db
              .update(accounts)
              .set({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
              })
              .where(eq(accounts.id, accountIdToUpdate)); // NOTE: This line might still show a TypeScript error depending on Drizzle version/setup.
          } else {
            console.error("DeviantArt account ID is undefined after lookup.");
            set.status = 500;
            return "Failed to link DeviantArt account to group: Account ID missing.";
          }
        }

        // --- Step 4: Update the group with the DeviantArt account ID ---
        if (deviantartAccountId) {
          await db
            .update(groups)
            .set({ deviantartAccountId: deviantartAccountId })
            .where(eq(groups.id, groupId));
          set.headers["Content-Type"] = "text/html";
          return `
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
        `; // Redirect to the group's page
        } else {
          set.status = 500;
          return "Failed to link DeviantArt account to group.";
        }
      } catch (error: any) {
        console.error("Error during DeviantArt OAuth callback:", error);
        set.status = 500;
        return "Error connecting DeviantArt.";
      }
    }
  )
  .get(
    "/connect/patreon/:id",
    async ({
      params,
      set,
      env,
    }: {
      params: { id: string };
      set: { status: number | undefined };
      env: {
        ONE_CLIENT_ID: string;
        PROD_URL: string;
      };
    }) => {
      const groupId = params.id;
      const clientId = env.ONE_CLIENT_ID;
      const redirectUri = `${env.PROD_URL}/api/v1/group/connect/patreon/callback`;
      const scope = "identity";
      const state = groupId;

      const authUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(scope)}&state=${state}`;

      set.status = 200;
      return { authUrl };
    }
  )
  .get(
    "/connect/deviantart/:id",
    async ({
      params,
      set,
      env,
    }: {
      params: { id: string };
      set: { status: number | undefined };
      env: {
        TWO_CLIENT_ID: string;
        PROD_URL: string;
      };
    }) => {
      const groupId = params.id;
      const clientId = env.TWO_CLIENT_ID;
      const redirectUri = `${env.PROD_URL}/api/v1/group/connect/deviantart/callback`;
      const responseType = "code";
      const scope = "user";
      const state = groupId;

      const authUrl = `https://www.deviantart.com/oauth2/authorize?response_type=${responseType}&client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(scope)}&state=${state}`;

      set.status = 200;
      return { authUrl };
    }
  );
