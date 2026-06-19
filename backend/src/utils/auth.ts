import { Context } from "hono";
import { ContextForHono } from "@/types/context";

export function getRequiredUserId(c: Context<ContextForHono>): string | null {
  const authUser = c.get("authUser") as any;
  return authUser?.user?.id ?? authUser?.session?.user?.id ?? authUser?.token?.sub ?? null;
}
