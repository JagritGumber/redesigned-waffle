import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import db from "@/db";
import users from "@/schema/users";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/utils/auth";

const publicUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  image: users.image,
};

export const authRouter = new Elysia({ prefix: "/auth" })
  .post(
    "/register",
    async ({ body, set }) => {
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

      const [user] = await db
        .insert(users)
        .values({
          email,
          name,
          password: await hashPassword(body.password),
        })
        .returning(publicUserColumns);

      const token = await createSession(user.id);
      setSessionCookie(set, token);
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
    async ({ body, set }) => {
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

      if (!user?.password || !(await verifyPassword(body.password, user.password))) {
        set.status = 401;
        return { status: "error", message: "Invalid email or password." };
      }

      const token = await createSession(user.id);
      setSessionCookie(set, token);
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
  .post("/logout", async ({ request, set }) => {
    await destroySession(request);
    clearSessionCookie(set);
    return { status: "success" };
  });
