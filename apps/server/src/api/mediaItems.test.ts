import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  attachFile,
  linkPerformer,
  makeFolder,
  makeItem,
  makeLibrary,
  makePerformer,
  makePhoto,
  makeStudio,
} from "../test/fixtures.js";

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

describe("GET /api/media-items", () => {
  it("returns items with pagination metadata", async () => {
    await makeItem(libraryId, { title: "One" });
    const body = (await get("/api/media-items")).json();
    expect(body.items).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("hides photos, which belong to a video's gallery rather than the library", async () => {
    await makeItem(libraryId, { title: "Video" });
    await makePhoto(libraryId);
    const body = (await get("/api/media-items")).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Video"]);
  });

  it("hides items whose folder was removed from the scan list", async () => {
    await makeItem(libraryId, { title: "Visible" });
    await makeItem(libraryId, { title: "Hidden", inScope: false });
    const body = (await get("/api/media-items")).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Visible"]);
  });

  it("reports hasMore without returning the extra row", async () => {
    for (let i = 0; i < 51; i++) await makeItem(libraryId, { title: `Item ${i}` });
    const body = (await get("/api/media-items")).json();
    expect(body.items).toHaveLength(50);
    expect(body.hasMore).toBe(true);
  });

  it("pages without duplicating or skipping rows", async () => {
    // Items created in the same instant share a createdAt; without the id
    // tiebreaker the two pages overlap.
    for (let i = 0; i < 60; i++) await makeItem(libraryId, { title: `Item ${i}` });
    const first = (await get("/api/media-items?page=1")).json();
    const second = (await get("/api/media-items?page=2")).json();
    const ids = [...first.items, ...second.items].map((i: { id: number }) => i.id);
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
  });

  describe("search", () => {
    it("matches a title", async () => {
      await makeItem(libraryId, { title: "Hot Wife Vacation" });
      await makeItem(libraryId, { title: "Something Else" });
      const body = (await get("/api/media-items?q=vacation")).json();
      expect(body.items).toHaveLength(1);
    });

    it("matches a performer's name", async () => {
      const id = await makeItem(libraryId, { title: "Untitled" });
      await linkPerformer(id, await makePerformer("Little Caprice"));
      const body = (await get("/api/media-items?q=caprice")).json();
      expect(body.items).toHaveLength(1);
    });

    it("matches every word separately, across different fields", async () => {
      // "caprice vixen" is a performer and a studio; treating the query as one
      // literal substring used to find nothing at all.
      const studioId = await makeStudio("Vixen");
      const id = await makeItem(libraryId, { title: "Untitled", studioId });
      await linkPerformer(id, await makePerformer("Little Caprice"));
      await makeItem(libraryId, { title: "Vixen only" });

      const body = (await get("/api/media-items?q=caprice%20vixen")).json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(id);
    });

    it("treats a four-digit word as a release year", async () => {
      await makeItem(libraryId, { title: "A", releaseDate: "2019-05-01" });
      await makeItem(libraryId, { title: "B", releaseDate: "2021-05-01" });
      const body = (await get("/api/media-items?q=2019")).json();
      expect(body.items).toHaveLength(1);
    });

    it("does not treat % and _ in a query as wildcards", async () => {
      await makeItem(libraryId, { title: "Scene 01" });
      const body = (await get("/api/media-items?q=Scene_01")).json();
      expect(body.items).toHaveLength(0);
    });

    it("ranks a title match above a merely newer item", async () => {
      await makeItem(libraryId, { title: "Vacation" });
      await makeItem(libraryId, { title: "Newer, unrelated" });
      const body = (await get("/api/media-items?q=vacation")).json();
      expect(body.items[0].title).toBe("Vacation");
    });
  });

  describe("filters", () => {
    it("filters by year", async () => {
      await makeItem(libraryId, { title: "A", releaseDate: "2019-05-01" });
      await makeItem(libraryId, { title: "B", releaseDate: "2021-05-01" });
      const body = (await get("/api/media-items?year=2021")).json();
      expect(body.items.map((i: { title: string }) => i.title)).toEqual(["B"]);
    });

    it("filters by favourite", async () => {
      await makeItem(libraryId, { title: "Loved", isFavorite: true });
      await makeItem(libraryId, { title: "Not" });
      const body = (await get("/api/media-items?favorite=true")).json();
      expect(body.items).toHaveLength(1);
    });

    it("returns nothing for a category that does not exist", async () => {
      // The important half: it must not fall back to returning everything,
      // which is what made one tile show the whole library.
      await makeItem(libraryId, { title: "A", kind: "video" });
      const body = (await get("/api/media-items?kind=nonexistent")).json();
      expect(body.items).toHaveLength(0);
    });

    it("shows only root-level items when unfiltered", async () => {
      const folderId = await makeFolder(libraryId);
      await makeItem(libraryId, { title: "Nested", parentId: folderId });
      const body = (await get("/api/media-items")).json();
      expect(body.items.map((i: { title: string }) => i.title)).toEqual(["A Folder"]);
    });
  });

  describe("sorting", () => {
    it("sorts by title", async () => {
      await makeItem(libraryId, { title: "Zebra" });
      await makeItem(libraryId, { title: "Apple" });
      const body = (await get("/api/media-items?sort=title")).json();
      expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Apple", "Zebra"]);
    });

    it("puts durationless items last when sorting by longest", async () => {
      await makeItem(libraryId, { title: "No duration" });
      await makeItem(libraryId, { title: "Long", durationSeconds: 3600 });
      const body = (await get("/api/media-items?sort=longest")).json();
      expect(body.items[0].title).toBe("Long");
    });
  });
});

describe("GET /api/media-items/:id", () => {
  it("returns the item with its file details", async () => {
    const id = await makeItem(libraryId, { title: "Detail" });
    await attachFile(id, rootId, "/media/a.mp4");
    const body = (await get(`/api/media-items/${id}`)).json();
    expect(body.title).toBe("Detail");
    expect(body.fileSizeBytes).toBe(1000);
  });

  it("404s for an out-of-scope item, so a deep link cannot reach it", async () => {
    const id = await makeItem(libraryId, { title: "Hidden", inScope: false });
    expect((await get(`/api/media-items/${id}`)).statusCode).toBe(404);
  });

  it("404s for an id that does not exist", async () => {
    expect((await get("/api/media-items/999999")).statusCode).toBe(404);
  });
});

describe("PATCH /api/media-items/:id", () => {
  const patch = (id: number, body: object) =>
    app.inject({
      method: "PATCH",
      url: `/api/media-items/${id}`,
      headers: { cookie },
      payload: body,
    });

  it("edits the title and takes ownership from the scanner", async () => {
    const id = await makeItem(libraryId, { title: "Old" });
    expect((await patch(id, { title: "New" })).json()).toEqual({ ok: true });

    // Read it back: the endpoint acknowledges rather than echoing the row.
    const item = (await get(`/api/media-items/${id}`)).json();
    expect(item.title).toBe("New");
    // From here the scanner leaves this title alone, even across renames.
    expect(item.titleSource).toBe("user");
  });

  it("rejects an empty title", async () => {
    const id = await makeItem(libraryId);
    expect((await patch(id, { title: "   " })).statusCode).toBe(400);
  });

  it("rejects a category that does not exist", async () => {
    const id = await makeItem(libraryId);
    expect((await patch(id, { kind: "not-a-category" })).statusCode).toBe(400);
  });

  it("accepts a category that does exist", async () => {
    const id = await makeItem(libraryId);
    expect((await patch(id, { kind: "movie" })).statusCode).toBe(200);
  });

  it("refuses to make an item its own parent", async () => {
    const id = await makeItem(libraryId);
    expect((await patch(id, { parentId: id })).statusCode).toBe(400);
  });

  it("clamps framing values rather than rejecting them", async () => {
    // They come from a drag, so a value a fraction out of range is a rounding
    // artefact, not a reason to fail the save.
    const id = await makeItem(libraryId);
    await patch(id, { thumbnailPositionX: 150, thumbnailScale: 9999 });

    const item = (await get(`/api/media-items/${id}`)).json();
    expect(item.thumbnailPositionX).toBe(100);
    expect(item.thumbnailScale).toBe(300);
  });
});

describe("GET /api/continue-watching", () => {
  it("does not error, and is empty with no playback", async () => {
    // This route 500'd on every request for a while: a fractional 0.92 bound
    // into `duration * $n` made Postgres infer an integer parameter.
    const res = await get("/api/continue-watching");
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });
});

describe("GET /api/release-years", () => {
  it("lists the years present, newest first, with counts", async () => {
    await makeItem(libraryId, { title: "A", releaseDate: "2019-05-01" });
    await makeItem(libraryId, { title: "B", releaseDate: "2021-05-01" });
    await makeItem(libraryId, { title: "C", releaseDate: "2021-08-01" });
    const body = (await get("/api/release-years")).json();
    expect(body.years).toEqual([
      { year: 2021, total: 2 },
      { year: 2019, total: 1 },
    ]);
  });
});

describe("GET /api/search/suggestions", () => {
  it("returns nothing for a query that is too short", async () => {
    expect((await get("/api/search/suggestions?q=a")).json()).toEqual({
      performers: [],
      studios: [],
      items: [],
    });
  });

  it("suggests performers, studios and titles", async () => {
    // This route 500'd on every keystroke: a correlated subquery referenced an
    // unqualified column that was ambiguous against the joined tables.
    const studioId = await makeStudio("Blacked");
    const id = await makeItem(libraryId, { title: "Black Tie", studioId });
    await linkPerformer(id, await makePerformer("Tori Black"));

    const body = (await get("/api/search/suggestions?q=black")).json();
    expect(body.performers.map((p: { name: string }) => p.name)).toEqual(["Tori Black"]);
    expect(body.studios.map((s: { name: string }) => s.name)).toEqual(["Blacked"]);
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Black Tie"]);
  });

  it("includes what the UI needs to draw each row", async () => {
    const id = await makeItem(libraryId, { title: "Black Tie" });
    await linkPerformer(id, await makePerformer("Tori Black"));
    const body = (await get("/api/search/suggestions?q=black")).json();
    expect(body.performers[0]).toMatchObject({ videoCount: 1 });
    expect(body.items[0].performers[0].name).toBe("Tori Black");
  });
});

describe("GET /api/media-items/:id/related", () => {
  it("prefers other videos with the same performer", async () => {
    const performerId = await makePerformer("Shared");
    const subject = await makeItem(libraryId, { title: "Subject" });
    const sibling = await makeItem(libraryId, { title: "Same performer" });
    await makeItem(libraryId, { title: "Unrelated" });
    await linkPerformer(subject, performerId);
    await linkPerformer(sibling, performerId);

    const body = (await get(`/api/media-items/${subject}/related`)).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Same performer"]);
  });

  it("falls back to folder siblings when nothing else relates", async () => {
    const subject = await makeItem(libraryId, { title: "Subject" });
    await makeItem(libraryId, { title: "Sibling" });
    const body = (await get(`/api/media-items/${subject}/related`)).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Sibling"]);
  });
});

describe("GET /api/media-items/:id/gallery", () => {
  it("returns the photos sitting in the same folder", async () => {
    const video = await makeItem(libraryId, { title: "Scene" });
    await attachFile(video, rootId, "/media/Alice/Studio/scene.mp4");
    const photo = await makePhoto(libraryId, "still-1");
    await attachFile(photo, rootId, "/media/Alice/Studio/1.jpg");
    const other = await makePhoto(libraryId, "elsewhere");
    await attachFile(other, rootId, "/media/Alice/Other/2.jpg");

    const body = (await get(`/api/media-items/${video}/gallery`)).json();
    expect(body.images.map((i: { title: string }) => i.title)).toEqual(["still-1"]);
  });

  it("does not treat _ in a folder name as a wildcard", async () => {
    const video = await makeItem(libraryId, { title: "Scene" });
    await attachFile(video, rootId, "/media/Alice/A_B/scene.mp4");
    const decoy = await makePhoto(libraryId, "decoy");
    await attachFile(decoy, rootId, "/media/Alice/AXB/1.jpg");

    const body = (await get(`/api/media-items/${video}/gallery`)).json();
    expect(body.images).toEqual([]);
  });
});
