import { count } from "drizzle-orm";
import { db } from "../db/client.js";
import { appSettings, webauthnCredentials } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Which sessions have proved the privacy credential recently.
 *
 * In memory, for the same reason the unlock throttle is: the process is
 * single-instance, and a restart clearing this fails closed — everyone is
 * locked again, which is the safe direction for something guarding deletion.
 *
 * This exists because /api/privacy/unlock used to verify the password and
 * then store nothing at all. That is fine for discreet mode, which is a blur
 * the browser applies and can undo anyway. It is not fine for an endpoint
 * that deletes library records: without server state, a UI that asks for a
 * password is a suggestion, and anyone who can reach the API can skip it.
 */
const unlocked = new Map<string, number>();

/**
 * How long proving it lasts.
 *
 * Long enough to work through a list of missing videos without retyping,
 * short enough that walking away from an unlocked machine doesn't leave the
 * delete endpoints open for the rest of the day.
 */
const UNLOCK_TTL_MS = 15 * 60 * 1000;

export function markUnlocked(sessionId: string): void {
  unlocked.set(sessionId, Date.now() + UNLOCK_TTL_MS);
}

export function isUnlocked(sessionId: string): boolean {
  const expires = unlocked.get(sessionId);
  if (expires === undefined) return false;
  if (expires <= Date.now()) {
    unlocked.delete(sessionId);
    return false;
  }
  return true;
}

export function lock(sessionId: string): void {
  unlocked.delete(sessionId);
}

/**
 * Whether a privacy credential exists at all.
 *
 * With neither a password nor a passkey there is nothing to prove, and
 * demanding proof would lock the owner out of their own library with no way
 * back. Matches what the client's `usePrivacyGuard` already means by
 * "guarded", so the two cannot disagree about whether a prompt is coming.
 */
export async function privacyIsConfigured(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "privacy"));
  const value = row?.value as { passwordHash?: unknown } | null;
  if (typeof value?.passwordHash === "string") return true;

  const [passkeys] = await db
    .select({ total: count() })
    .from(webauthnCredentials);
  return (passkeys?.total ?? 0) > 0;
}
