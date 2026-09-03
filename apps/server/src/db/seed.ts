import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { libraries, libraryRoots, mediaItemTypes } from "./schema.js";

const MEDIA_ITEM_TYPES = ["video", "photo", "folder"] as const;

export async function seed(): Promise<void> {
  for (const name of MEDIA_ITEM_TYPES) {
    const existing = await db
      .select()
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, name));
    if (existing.length === 0) {
      await db.insert(mediaItemTypes).values({ name });
    }
  }

  const mediaRoot = process.env.MEDIA_ROOT;
  if (!mediaRoot) return;

  const existingRoot = await db
    .select()
    .from(libraryRoots)
    .where(eq(libraryRoots.path, mediaRoot));

  if (existingRoot.length > 0) return;

  const [library] = await db
    .insert(libraries)
    .values({ name: "Library" })
    .returning();

  await db.insert(libraryRoots).values({
    libraryId: library.id,
    path: mediaRoot,
  });
}
