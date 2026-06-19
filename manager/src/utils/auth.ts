import { eq } from "drizzle-orm";
import db from "@/db";
import sessions from "@/schema/sessions";
import users from "@/schema/users";

const SESSION_COOKIE = "selfhost_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function parseCookie(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function setSessionCookie(set: { headers: Record<string, string> }, token: string) {
  const secure = Bun.env.NODE_ENV === "production" ? "; Secure" : "";
  set.headers["Set-Cookie"] = `${SESSION_COOKIE}=${encodeURIComponent(
    token,
  )}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

export function clearSessionCookie(set: { headers: Record<string, string> }) {
  set.headers["Set-Cookie"] = `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  await db.insert(sessions).values({
    sessionToken: token,
    userId,
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function getSessionUser(request: Request) {
  const token = parseCookie(request.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) return null;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.sessionToken, token),
  });
  if (!session || session.expires.getTime() <= Date.now()) {
    if (session) {
      await db.delete(sessions).where(eq(sessions.sessionToken, token));
    }
    return null;
  }

  return db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { id: true, email: true, name: true, image: true },
  });
}

export async function requireUserId(
  request: Request,
  set: { status?: number; headers: Record<string, string> },
): Promise<string | null> {
  const user = await getSessionUser(request);
  if (!user) {
    set.status = 401;
    return null;
  }
  return user.id;
}

export async function destroySession(request: Request) {
  const token = parseCookie(request.headers.get("cookie"))[SESSION_COOKIE];
  if (token) {
    await db.delete(sessions).where(eq(sessions.sessionToken, token));
  }
}
