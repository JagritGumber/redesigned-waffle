import { Hono } from "hono";
import authRouter from "./v1/authRouter";
import { verifyAuth } from "@hono/auth-js";
import Patreon from "@auth/core/providers/patreon";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { initAuthConfig } from "@hono/auth-js";
import {
  accounts,
  authenticators,
  sessions,
  users,
  verificationTokens,
} from "@/schema";
import { ContextForHono } from "@/types/context";
import groupRouter from "./v1/groupRouter";

const v1Router = new Hono<ContextForHono>()
  .use(
    "*",
    initAuthConfig((c) => ({
      adapter: DrizzleAdapter(c.get("db"), {
        usersTable: users,
        accountsTable: accounts,
        authenticatorsTable: authenticators,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      }),
      secret: c.env.AUTH_SECRET,
      providers: [
        Patreon({
          clientId: c.env.ONE_CLIENT_ID,
          clientSecret: c.env.ONE_CLIENT_SECRET,
        }),
        {
          id: "deviantart",
          name: "",
          type: "oauth",
          version: "2.0",
          scope: "basic",
          params: { grant_type: "authorization_code" },
          accessTokenUrl: "https://www.deviantart.com/oauth2/token",
          requestTokenUrl: "https://www.deviantart.com/oauth2/token",
          authorizationUrl:
            "https://www.deviantart.com/oauth2/authorize?response_type=code",
          profileUrl: "https://www.deviantart.com/api/v1/oauth2/user/whoami",
          async profile(profile, tokens) {
            return {
              id: profile.userid,
              name: profile.username,
              email: null,
              image: profile.profile.cover_photo,
            };
          },
          clientId: c.env.TWO_CLIENT_ID,
          clientSecret: c.env.TWO_CLIENT_SECRET,
        },
      ],
      session: {
        strategy: "jwt",
      },
      callbacks: {
        async jwt({ token, trigger }) {
          if (trigger === "signUp") {
            // New User can be done something
          }
          return token;
        },
        async session({ session }) {
          return session;
        },
      },
    }))
  )
  .route("/group", groupRouter)
  .use("*", verifyAuth())
  .route("/auth", authRouter);

export default v1Router;
