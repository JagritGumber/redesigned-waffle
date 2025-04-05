// import { createUserValidator } from "@semanix/common/validators";
// import { ApiResponse } from "@semanix/common/types";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import hashPassword from "@/utils/secrets/hashPassword";
import { SelectUser } from "@/schema/users";
import { authHandler } from "@hono/auth-js";
import { Hono } from "hono";
import tryPromise from "@/utils/promises/tryPromise";
import users from "@/schema/users";
import { ContextForHono } from "@/types/context";

const authRouter = new Hono<ContextForHono>()
  .use("*", authHandler())
  .get("/protected", (c) => {
    const auth = c.get("authUser");
    return c.json(auth);
  });
// .post("/user", zValidator("json", createUserValidator), async (c) => {
//   const { name, email, password } = c.req.valid("json");
//   const [searchUser, searchUserError] = await tryPromise(
//     c.get("db").select().from(users).where(eq(users.email, email)).limit(1)
//   );

//   if (searchUser?.length !== 0) {
//     return c.json(
//       {
//         success: false,
//         message: "User already exists",
//         data: null,
//       } satisfies ApiResponse,
//       400
//     );
//   }

//   // User doesn't exists
//   // Start Registration and for start hash their password
//   const [hashedPassword, hashedPasswordError] = await tryPromise(
//     hashPassword(password)
//   );

//   if (hashedPasswordError) {
//     return c.json(
//       {
//         success: false,
//         message: hashedPasswordError?.message,
//         data: null,
//       } satisfies ApiResponse,
//       500
//     );
//   }

//   // Everything is alright make the user

//   const [user, userError] = await tryPromise(
//     c
//       .get("db")
//       .insert(users)
//       .values({
//         name,
//         email,
//         password: hashedPassword,
//       })
//       .returning()
//   );

//   if (userError) {
//     return c.json(
//       {
//         success: false,
//         message: userError?.message,
//         data: null,
//       } satisfies ApiResponse,
//       500
//     );
//   }

//   return c.json(
//     {
//       success: true,
//       message: "User created Successfully",
//       data: {
//         id: user[0].id,
//         email: user[0].email,
//       },
//     } satisfies ApiResponse<Pick<SelectUser, "id" | "email">>,
//     200
//   );
// });

export default authRouter;
