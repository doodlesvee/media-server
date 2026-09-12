import { desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { activityEvents } from "../db/schema.js";

export type ActivityType =
  | "scan"
  | "backup"
  | "metadata"
  | "collection"
  | "privacy"
  | "cache"
  | "library";

export async function logActivity(
  type: ActivityType,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .insert(activityEvents)
      .values({ type, message, metadata: metadata ?? null });
  } catch {
    // Activity is observability, never a reason to fail the operation being observed.
  }
}

export async function listActivity(limit = 100) {
  return db
    .select()
    .from(activityEvents)
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(Math.min(500, Math.max(1, limit)));
}
