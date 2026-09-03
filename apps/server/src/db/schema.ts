import {
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
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
  description: text("description"),
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
