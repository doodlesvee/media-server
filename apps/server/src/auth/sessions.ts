import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export const SESSION_COOKIE = "media_session";

const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

// Sliding expiry: only rewrite the row once a session is more than a day old,
// so ordinary browsing doesn't issue an UPDATE on every single request.
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function expiryFromNow(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

export async function createSession(userId: number): Promise<string> {
  const id = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ id, userId, expiresAt: expiryFromNow() });
  return id;
}

export type SessionUser = { id: number; username: string };

/**
 * Resolves a cookie value to its user, or null. Expired rows are deleted on
 * sight rather than swept by a scheduled job — the only thing that reads a
 * session is this function, so lazily is soon enough.
 */
export async function resolveSession(sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;

  const [row] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      username: users.username,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId));

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }

  if (row.expiresAt.getTime() - Date.now() < SESSION_MAX_AGE_SECONDS * 1000 - REFRESH_THRESHOLD_MS) {
    await db.update(sessions).set({ expiresAt: expiryFromNow() }).where(eq(sessions.id, row.id));
  }

  return { id: row.userId, username: row.username };
}

export async function destroySession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Housekeeping on boot, so dead rows don't accumulate forever. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return row !== undefined;
}
