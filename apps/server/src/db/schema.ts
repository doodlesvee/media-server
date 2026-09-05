import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
  // A per-item flag rather than a well-known tag: "favourite" is a state you
  // toggle, not a descriptive label, and keeping it off the tag list stops it
  // polluting the sidebar and the tag rows.
  isFavorite: boolean("is_favorite").notNull().default(false),
  studioId: integer("studio_id").references((): AnyPgColumn => studios.id),
  // Same scanner-owns-it-until-you-edit-it contract as titleSource and
  // performersSource.
  studioSource: text("studio_source").notNull().default("scanner"),
  // Filename under APP_DATA_DIR/item-thumbnails of an uploaded override.
  // Null means "use the generated poster". The random suffix in the name is
  // what lets the served URL change when you replace the image.
  thumbnailFile: text("thumbnail_file"),
  // How the thumbnail is framed wherever it's shown — tile, hero, hover card.
  // Display only: the image file is never cropped, so re-framing costs no
  // quality and stays adjustable. Same shape as `categories.cover_*`.
  thumbnailPositionX: integer("thumbnail_position_x").notNull().default(50),
  thumbnailPositionY: integer("thumbnail_position_y").notNull().default(50),
  thumbnailScale: integer("thumbnail_scale").notNull().default(100),
  // False when the item's file sits in a folder you've removed from the scan
  // list. Distinct from missingSince, which means the file vanished from a
  // folder still being watched — different causes, different fixes. Rows are
  // hidden rather than deleted so re-adding the folder restores everything.
  inScope: boolean("in_scope").notNull().default(true),
  // What kind of thing this is, as opposed to itemTypeId which is the media
  // type (video/photo/folder). Everything scanned starts as a plain "video";
  // "movie" and "series" are set by hand, since nothing in a filename can
  // reliably tell them apart.
  kind: text("kind").notNull().default("video"),
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
  // Which configured folder this file came from. Null once that folder is
  // removed. Replaces matching on a path prefix, which needed a LIKE pattern
  // built from a user-chosen path — unsafe when a folder name contains _ or %.
  rootId: integer("root_id").references((): AnyPgColumn => libraryRoots.id),
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
    // Framing for the portrait, the same shape as categories and thumbnails.
    // Defaults centre horizontally and sit near the top, matching the
    // `object-top` the cards hardcoded before this was adjustable — faces are
    // usually up there, so it's a better default than dead centre.
    imagePositionX: integer("image_position_x").notNull().default(50),
    imagePositionY: integer("image_position_y").notNull().default(0),
    imageScale: integer("image_scale").notNull().default(100),
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

export const studios = pgTable(
  "studios",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // Case-insensitive, same reasoning as performers: "[Vixen]" and a typed
  // "vixen" are one studio, not two.
  (table) => [uniqueIndex("studios_name_lower_idx").on(sql`lower(${table.name})`)]
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

// Generic key/value so a new setting is a new key rather than a migration.
// Values are jsonb because settings are shaped objects, not scalars.
// Home-page categories. Data rather than a constant, so they can be added,
// renamed, reordered and removed without a deploy. Items reference a category
// by slug, so renaming a label never has to touch media_items.
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  position: integer("position").notNull().default(0),
  coverFile: text("cover_file"),
  // Which horizontal band of the cover the tile shows, as a percentage —
  // the same display-only framing `performers.bannerPositionY` stores. The
  // file is never cropped, so this stays adjustable forever and re-framing
  // costs no image quality.
  coverPositionX: integer("cover_position_x").notNull().default(50),
  coverPositionY: integer("cover_position_y").notNull().default(50),
  // Zoom as a percentage — 100 is the untouched `object-cover` fit. Stored
  // alongside the position because the two together are the framing; neither
  // touches the file.
  coverScale: integer("cover_scale").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  // scrypt, as "<salt-hex>:<derived-key-hex>". Node's crypto has it built in,
  // so this needs no native dependency and no third-party hashing library.
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Server-side sessions rather than a self-contained token: a row can be
// deleted, so "sign out everywhere" is a DELETE instead of a token-blocklist
// scheme bolted on later.
export const sessions = pgTable("sessions", {
  // The cookie value itself — 32 random bytes, hex. Not sequential, so it
  // can't be guessed from another session's id.
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  // Set once a video is played to the end (or marked watched by hand), and
  // cleared when it's un-marked. A nullable timestamp rather than a boolean
  // so "when did I finish this" is answerable later without another column.
  completedAt: timestamp("completed_at"),
  // Incremented on each completion. Cheap to keep, and it's the only signal
  // the app would have for a "most played" view.
  playCount: integer("play_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
