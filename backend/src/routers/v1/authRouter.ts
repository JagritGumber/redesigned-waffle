import { eq } from "drizzle-orm";
import hashPassword from "@/utils/secrets/hashPassword";
import { authHandler } from "@hono/auth-js";
import { Hono } from "hono";
import users from "@/schema/users";
import { ContextForHono } from "@/types/context";

const authRouter = new Hono<ContextForHono>()
  .post("/register", async (c) => {
    const body = await c.req.json<{
      name?: string;
      email?: string;
      password?: string;
    }>();
    const name = body.name?.trim() || null;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ message: "A valid email is required." }, 400);
    }
    if (password.length < 8) {
      return c.json({ message: "Password must be at least 8 characters." }, 400);
    }

    const db = c.get("db");
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return c.json({ message: "User already exists." }, 409);
    }

    const [user] = await db
      .insert(users)
      .values({
        name,
        email,
        password: await hashPassword(password),
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    return c.json({ user }, 201);
  })
  .use("*", authHandler())
  .get("/protected", (c) => {
    const auth = c.get("authUser");
    return c.json(auth);
  });

export default authRouter;
