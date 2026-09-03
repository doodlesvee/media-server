import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const mediaItemTypes = pgTable("media_item_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // 'video' | 'photo' | 'folder'
});

export const libraries = pgTable("libraries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const libraryRoots = pgTable("library_roots", {
  id: serial("id").primaryKey(),
  libraryId: integer("library_id")
    .notNull()
    .references(() => libraries.id),
  path: text("path").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaItems = pgTable("media_items", {
  id: serial("id").primaryKey(),
  libraryId: integer("library_id")
    .notNull()
    .references(() => libraries.id),
  parentId: integer("parent_id").references((): AnyPgColumn => mediaItems.id),
  itemTypeId: integer("item_type_id")
    .notNull()
    .references(() => mediaItemTypes.id),
  title: text("title").notNull(),
  // 'filename' while the title is still whatever the scanner derived, then
  // 'user' once it's been edited in the app. Lets a rename on disk update an
  // untouched title without ever clobbering one you actually wrote.
  titleSource: text("title_source").notNull().default("filename"),
  description: text("description"),
  // 'scanner' while the performer set is still whatever the folder layout
  // implied, then 'user' once it's edited in the app. Mirrors titleSource:
  // the folder decides an item's performers until you touch them, then you
  // do — which is what makes "I removed this performer" survive a rescan.
  performersSource: text("performers_source").notNull().default("scanner"),
  durationSeconds: integer("duration_seconds"),
  takenAt: timestamp("taken_at"),
  extraMetadata: jsonb("extra_metadata"),
  missingSince: timestamp("missing_since"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mediaFiles = pgTable("media_files", {
  id: serial("id").primaryKey(),
  mediaItemId: integer("media_item_id")
    .notNull()
    .references(() => mediaItems.id),
  path: text("path").notNull().unique(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  mtime: timestamp("mtime").notNull(),
  contentHash: text("content_hash"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scanJobs = pgTable("scan_jobs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(), // 'running' | 'completed' | 'failed'
  filesScanned: integer("files_scanned").notNull().default(0),
  filesTotal: integer("files_total"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  error: text("error"),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaItemTags = pgTable(
  "media_item_tags",
  {
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.mediaItemId, table.tagId] })]
);

export const performers = pgTable(
  "performers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // Filenames (not paths) of user-uploaded artwork under
    // APP_DATA_DIR/performer-images. Null means nothing was uploaded, and the
    // UI falls back to a frame from one of their videos. The filename carries
    // a random suffix so replacing an image changes the URL and defeats the
    // browser cache without any invalidation logic.
    imageFile: text("image_file"),
    bannerFile: text("banner_file"),
    // Which horizontal band of the banner image is visible, as a percentage
    // for CSS object-position. The image is stored uncropped so this stays
    // adjustable forever; 50 is dead centre.
    bannerPositionY: integer("banner_position_y").notNull().default(50),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // Unique on lower(name) rather than a plain .unique(): Postgres unique
  // constraints are case-sensitive, so a folder named "Alice Smith" and a
  // hand-typed "alice smith" would otherwise become two separate performers.
  (table) => [uniqueIndex("performers_name_lower_idx").on(sql`lower(${table.name})`)]
);

export const mediaItemPerformers = pgTable(
  "media_item_performers",
  {
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id),
    performerId: integer("performer_id")
      .notNull()
      .references(() => performers.id),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.mediaItemId, table.performerId] })]
);

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // 'manual' | 'smart'
  smartRule: jsonb("smart_rule"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id),
    mediaItemId: integer("media_item_id")
      .notNull()
      .references(() => mediaItems.id),
    position: integer("position"),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.mediaItemId] })]
);

// No user_id yet — single-user for now (per Section 2's future-proofing
// note, this is exactly the kind of inherently-per-person table that gets a
// user_id column once the auth phase lands, without needing a data migration
// beyond adding that column).
export const playbackStates = pgTable("playback_states", {
  id: serial("id").primaryKey(),
  mediaItemId: integer("media_item_id")
    .notNull()
    .unique()
    .references(() => mediaItems.id),
  positionSeconds: integer("position_seconds").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
