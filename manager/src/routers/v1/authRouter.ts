import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { rateLimit } from "elysia-rate-limit";
import db from "@/db";
import users from "@/schema/users";
import {
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from "@/utils/auth";

const publicUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  image: users.image,
};

export const authRouter = new Elysia({ prefix: "/auth" })
  .use(
    rateLimit({
      max: (key, request) => {
        const { pathname } = new URL(request.url);
        if (pathname.endsWith("/register") || pathname.endsWith("/login")) return 5;
        if (pathname.endsWith("/logout")) return 10;
        return 30;
      },
      duration: 60_000,
      errorResponse: "Too many requests. Please try again later.",
    }),
  )
  .post(
    "/register",
    async ({ body, set, cookie }) => {
      const email = body.email.trim().toLowerCase();
      const name = body.name?.trim() || null;

      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        set.status = 409;
        return { status: "error", message: "User already exists." };
      }

      const [user, sessionToken] = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            email,
            name,
            password: await hashPassword(body.password),
          })
          .returning(publicUserColumns);

        const token = await createSession(user.id, tx);
        return [user, token] as const;
      });

      cookie.selfhost_session.set({
        value: sessionToken,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
        secure: Bun.env.NODE_ENV === "production",
      });
      set.status = 201;
      return { status: "success", user };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
        name: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, set, cookie }) => {
      const email = body.email.trim().toLowerCase();
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
          password: users.password,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        set.status = 401;
        return { status: "error", message: "Invalid email or password." };
      }

      if (!user.password) {
        set.status = 401;
        return {
          status: "error",
          message:
            "This account uses OAuth. Please sign in with your provider.",
        };
      }

      if (!(await verifyPassword(body.password, user.password))) {
        set.status = 401;
        return { status: "error", message: "Invalid email or password." };
      }

      const token = await createSession(user.id);
      cookie.selfhost_session.set({
        value: token,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
        secure: Bun.env.NODE_ENV === "production",
      });
      return {
        status: "success",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 1 }),
      }),
    },
  )
  .get("/me", async ({ request, set }) => {
    const user = await getSessionUser(request);
    if (!user) {
      set.status = 401;
      return { status: "error", message: "Authentication required." };
    }
    return { status: "success", user };
  })
  .post("/logout", async ({ request, cookie }) => {
    await destroySession(request);
    cookie.selfhost_session.remove();
    return { status: "success" };
  });
