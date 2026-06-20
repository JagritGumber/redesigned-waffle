import { Hono } from "hono";
import v1Router from "./routers/v1Router";
import { ContextForHono } from "./types/context";
import { drizzle } from "drizzle-orm/d1";
import { cors } from "hono/cors";
import * as schema from "@/schema";
import { initAuthConfig } from "@hono/auth-js";
import Credentials from "@auth/core/providers/credentials";
import { eq } from "drizzle-orm";
import users from "@/schema/users";
import comparePassword from "@/utils/secrets/comparePassword";
import { pollRunPodModelImageBuilds } from "@/services/runpodBuildStatusService";

const app = new Hono<ContextForHono>()
  .use(
    cors({
      origin: (origin) => origin,
      credentials: true,
    }),
  )
  .use("*", (c, next) => {
    const db = drizzle(c.env.DB, { schema });
    c.set("db", db);
    return next();
  })
  .use(
    "*",
    initAuthConfig((c) => ({
      secret: c.env.AUTH_SECRET,
      trustHost: true,
      session: { strategy: "jwt" },
      providers: [
        Credentials({
          credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
          },
          async authorize(credentials) {
            const email =
              typeof credentials.email === "string"
                ? credentials.email.trim().toLowerCase()
                : "";
            const password =
              typeof credentials.password === "string"
                ? credentials.password
                : "";

            if (!email || !password) return null;

            const db = c.get("db");
            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.email, email))
              .limit(1);

            if (!user?.password) return null;

            const validPassword = await comparePassword(password, user.password);
            if (!validPassword) return null;

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
            };
          },
        }),
      ],
      callbacks: {
        jwt({ token, user }) {
          if (user?.id) {
            token.sub = user.id;
          }
          return token;
        },
        session({ session, token }) {
          if (session.user && token.sub) {
            session.user.id = token.sub;
          }
          return session;
        },
      },
    })),
  )
  .route("/api/v1", v1Router);

export default {
  port: 8080,
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: ContextForHono["Bindings"], ctx: ExecutionContext) {
    const db = drizzle(env.DB, { schema });
    ctx.waitUntil(
      pollRunPodModelImageBuilds(db, env).catch((error) => {
        console.error("RunPod model image build polling failed:", error);
      }),
    );
  },
};
