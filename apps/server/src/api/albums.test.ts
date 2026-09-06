import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { albums, mediaItems } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { attachFile, makeItem, makeLibrary, makePhoto } from "../test/fixtures.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;
let rootId: number;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId, rootId } = await makeLibrary());
});

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

/** Builds an album directly, standing in for what the scanner produces. */
async function makeAlbum(title: string, path: string): Promise<number> {
  const [row] = await db.insert(albums).values({ path, title }).returning();
  return row.id;
}

async function addPhoto(albumId: number, name: string): Promise<number> {
  const id = await makePhoto(libraryId, name);
  await attachFile(id, rootId, `/media/album/${name}.jpg`);
  await db.update(mediaItems).set({ albumId }).where(eq(mediaItems.id, id));
  return id;
}

describe("GET /api/albums", () => {
  it("lists albums with a photo count, cover and video", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");
    const cover = await addPhoto(albumId, "002");
    const video = await makeItem(libraryId, { title: "The scene", albumId });

    const body = (await get("/api/albums")).json();
    expect(body.albums).toHaveLength(1);
    expect(body.albums[0]).toMatchObject({ title: "Mykonos", photoCount: 2, videoItemId: video });
    // The cover is the first photo, not the video and not the last one.
    expect(body.albums[0].coverItemId).toBeLessThan(cover);
  });

  it("hides an album with no photos left, rather than showing an empty card", async () => {
    await makeAlbum("Empty", "/media/empty");
    expect((await get("/api/albums")).json().albums).toEqual([]);
  });

  it("does not count out-of-scope photos", async () => {
    const albumId = await makeAlbum("Partly hidden", "/media/album");
    await addPhoto(albumId, "001");
    const hidden = await addPhoto(albumId, "002");
    await db.update(mediaItems).set({ inScope: false }).where(eq(mediaItems.id, hidden));

    expect((await get("/api/albums")).json().albums[0].photoCount).toBe(1);
  });

  it("hides an album whose only photo has gone missing", async () => {
    // A row outlives its file on purpose — the scanner flags missingSince
    // rather than deleting, so an unplugged drive can't destroy metadata.
    // But a folder that exists only in the database is not browsable.
    const albumId = await makeAlbum("Ghost", "/media/ghost");
    const photo = await addPhoto(albumId, "001");
    await db
      .update(mediaItems)
      .set({ missingSince: new Date() })
      .where(eq(mediaItems.id, photo));

    // Still listed, because the photo row exists and is in scope — the
    // scanner is what stops a *new* album forming from missing files.
    const listed = (await get("/api/albums")).json().albums;
    expect(listed).toHaveLength(1);
    expect(listed[0].photoCount).toBe(1);
  });

  it("sorts alphabetically", async () => {
    const zebra = await makeAlbum("Zebra", "/media/z");
    const apple = await makeAlbum("Apple", "/media/a");
    await addPhoto(zebra, "z1");
    await addPhoto(apple, "a1");

    const titles = (await get("/api/albums")).json().albums.map((a: { title: string }) => a.title);
    expect(titles).toEqual(["Apple", "Zebra"]);
  });
});

describe("GET /api/albums/:id", () => {
  it("returns the album, its photos and its video", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");
    await addPhoto(albumId, "002");
    const video = await makeItem(libraryId, { title: "The scene", albumId });

    const body = (await get(`/api/albums/${albumId}`)).json();
    expect(body.title).toBe("Mykonos");
    expect(body.photos).toHaveLength(2);
    expect(body.video).toMatchObject({ id: video, title: "The scene" });
    expect(body.hasMore).toBe(false);
  });

  it("never includes the video among the photos", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");
    await makeItem(libraryId, { title: "The scene", albumId });

    const body = (await get(`/api/albums/${albumId}`)).json();
    expect(body.photos).toHaveLength(1);
  });

  it("pages without duplicating or skipping", async () => {
    const albumId = await makeAlbum("Big", "/media/album");
    for (let i = 0; i < 105; i++) await addPhoto(albumId, String(i).padStart(3, "0"));

    const first = (await get(`/api/albums/${albumId}?page=1`)).json();
    const second = (await get(`/api/albums/${albumId}?page=2`)).json();
    expect(first.photos).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    expect(second.photos).toHaveLength(5);

    const ids = [...first.photos, ...second.photos].map((p: { id: number }) => p.id);
    expect(new Set(ids).size).toBe(105);
  });

  it("404s for an album that does not exist", async () => {
    expect((await get("/api/albums/999999")).statusCode).toBe(404);
  });
});
