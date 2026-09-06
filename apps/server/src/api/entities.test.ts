import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  linkPerformer,
  makeItem,
  makeLibrary,
  makePerformer,
  makeStudio,
} from "../test/fixtures.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId } = await makeLibrary());
});

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
const send = (method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, payload: payload as object });

describe("performers", () => {
  it("counts each performer's videos", async () => {
    const alice = await makePerformer("Alice");
    await linkPerformer(await makeItem(libraryId, { title: "One" }), alice);
    await linkPerformer(await makeItem(libraryId, { title: "Two" }), alice);

    const body = (await get("/api/performers")).json();
    expect(body.performers).toHaveLength(1);
    expect(body.performers[0].videoCount).toBe(2);
  });

  it("keeps a performer with no videos", async () => {
    // You create one by hand so the scanner can match them next time; a
    // WHERE instead of a join condition would drop them entirely.
    await makePerformer("Nobody Yet");
    const body = (await get("/api/performers")).json();
    expect(body.performers[0].videoCount).toBe(0);
  });

  it("credits a two-performer video to both", async () => {
    const item = await makeItem(libraryId, { title: "Shared" });
    await linkPerformer(item, await makePerformer("Alice"));
    await linkPerformer(item, await makePerformer("Bella"));

    const body = (await get("/api/performers")).json();
    expect(body.performers.map((p: { videoCount: number }) => p.videoCount)).toEqual([1, 1]);
  });

  it("replaces the whole set and takes ownership from the scanner", async () => {
    const item = await makeItem(libraryId, { title: "X" });
    await linkPerformer(item, await makePerformer("Old"));

    await send("PUT", `/api/media-items/${item}/performers`, { performerNames: ["New", "Other"] });
    const detail = (await get(`/api/media-items/${item}`)).json();
    expect(detail.performers.map((p: { name: string }) => p.name).sort()).toEqual([
      "New",
      "Other",
    ]);
    expect(detail.performersSource).toBe("user");
  });

  it("collapses names that differ only by case", async () => {
    // Two ids for one person would violate the join table's primary key.
    const item = await makeItem(libraryId, { title: "X" });
    const res = await send("PUT", `/api/media-items/${item}/performers`, {
      performerNames: ["Alice", "alice"],
    });
    expect(res.statusCode).toBe(200);
    expect((await get(`/api/media-items/${item}`)).json().performers).toHaveLength(1);
  });

  it("refuses to rename onto an existing name", async () => {
    await makePerformer("Alice");
    const bella = await makePerformer("Bella");
    expect((await send("PATCH", `/api/performers/${bella}`, { name: "alice" })).statusCode).toBe(
      409
    );
  });

  it("saves a bio on its own, without re-sending the name", async () => {
    // The partial-update branch used to trigger only on framing fields, so a
    // bio-only PATCH fell through to a path that 400s without a name.
    const alice = await makePerformer("Alice");
    const res = await send("PATCH", `/api/performers/${alice}`, { bio: "  Some prose.  " });
    expect(res.statusCode).toBe(200);

    const detail = (await get(`/api/performers/${alice}`)).json();
    expect(detail.bio).toBe("Some prose.");
  });

  it("stores a cleared bio as null, not an empty string", async () => {
    const alice = await makePerformer("Alice");
    await send("PATCH", `/api/performers/${alice}`, { bio: "Written" });
    await send("PATCH", `/api/performers/${alice}`, { bio: "   " });
    expect((await get(`/api/performers/${alice}`)).json().bio).toBeNull();
  });

  it("keeps the bio off the list endpoint, which renders every performer", async () => {
    const alice = await makePerformer("Alice");
    await send("PATCH", `/api/performers/${alice}`, { bio: "Written" });
    expect((await get("/api/performers")).json().performers[0].bio).toBeUndefined();
  });

  describe("profile aggregates", () => {
    it("breaks videos down by studio, including those with none", async () => {
      // The null bucket has to exist: without it, videos with no studio
      // silently vanish from a grouped view.
      const alice = await makePerformer("Alice");
      const vixen = await makeStudio("Vixen");
      await linkPerformer(await makeItem(libraryId, { title: "A", studioId: vixen }), alice);
      await linkPerformer(await makeItem(libraryId, { title: "B", studioId: vixen }), alice);
      await linkPerformer(await makeItem(libraryId, { title: "C" }), alice);

      const body = (await get(`/api/performers/${alice}`)).json();
      expect(body.studios).toEqual([
        { name: "Vixen", count: 2 },
        { name: null, count: 1 },
      ]);
      // Every video is accounted for.
      const total = body.studios.reduce((n: number, s: { count: number }) => n + s.count, 0);
      expect(total).toBe(body.videoCount);
    });

    it("breaks videos down by year, including undated ones", async () => {
      const alice = await makePerformer("Alice");
      await linkPerformer(
        await makeItem(libraryId, { title: "A", releaseDate: "2019-05-01" }),
        alice
      );
      await linkPerformer(await makeItem(libraryId, { title: "B" }), alice);

      const body = (await get(`/api/performers/${alice}`)).json();
      expect(body.years).toEqual([
        { year: null, count: 1 },
        { year: 2019, count: 1 },
      ]);
    });

    it("counts watch state", async () => {
      const alice = await makePerformer("Alice");
      const watched = await makeItem(libraryId, { title: "A", durationSeconds: 1000 });
      const partial = await makeItem(libraryId, { title: "B", durationSeconds: 1000 });
      await linkPerformer(watched, alice);
      await linkPerformer(partial, alice);
      await linkPerformer(await makeItem(libraryId, { title: "C" }), alice);

      await send("PUT", `/api/media-items/${watched}/watched`, { watched: true });
      await send("PUT", `/api/media-items/${partial}/playback`, { positionSeconds: 300 });

      const body = (await get(`/api/performers/${alice}`)).json();
      expect(body.watch).toEqual({ watched: 1, inProgress: 1, unwatched: 1 });
    });

    it("lists co-performers with what the UI needs to draw a portrait", async () => {
      const alice = await makePerformer("Alice");
      const bella = await makePerformer("Bella");
      const shared = await makeItem(libraryId, { title: "Shared" });
      await linkPerformer(shared, alice);
      await linkPerformer(shared, bella);
      // A solo video must not invent a co-performer.
      await linkPerformer(await makeItem(libraryId, { title: "Solo" }), alice);

      const body = (await get(`/api/performers/${alice}`)).json();
      expect(body.coPerformers).toHaveLength(1);
      expect(body.coPerformers[0]).toMatchObject({ name: "Bella", together: 1 });
      expect(body.coPerformers[0].representativeItemId).toBe(shared);
    });

    it("reports each co-performer's own video total, not just the shared one", async () => {
      // The tile reads "N videos", so this is their whole catalogue. It also
      // guards a real failure: computing it as a correlated subquery rendered
      // `from "co_performer"` — an alias, not a table — and 500'd the route.
      const alice = await makePerformer("Alice");
      const bella = await makePerformer("Bella");
      const shared = await makeItem(libraryId, { title: "Shared" });
      await linkPerformer(shared, alice);
      await linkPerformer(shared, bella);
      await linkPerformer(await makeItem(libraryId, { title: "Bella solo" }), bella);

      const res = await get(`/api/performers/${alice}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().coPerformers[0]).toMatchObject({
        name: "Bella",
        together: 1,
        videoCount: 2,
      });
    });

    it("returns empty aggregates for a performer with no videos", async () => {
      const alice = await makePerformer("Alice");
      const body = (await get(`/api/performers/${alice}`)).json();
      expect(body.studios).toEqual([]);
      expect(body.coPerformers).toEqual([]);
      expect(body.watch).toEqual({ watched: 0, inProgress: 0, unwatched: 0 });
    });
  });

  it("clamps portrait framing", async () => {
    const alice = await makePerformer("Alice");
    await send("PATCH", `/api/performers/${alice}`, { imageScale: 9999, imagePositionX: -20 });
    const body = (await get("/api/performers")).json();
    expect(body.performers[0].imageScale).toBe(300);
    expect(body.performers[0].imagePositionX).toBe(0);
  });
});

describe("tags", () => {
  it("creates unknown tags on assignment and replaces the set", async () => {
    const item = await makeItem(libraryId, { title: "X" });
    await send("PUT", `/api/media-items/${item}/tags`, { tagNames: ["one", "two"] });
    expect((await get("/api/tags")).json().tags).toHaveLength(2);

    await send("PUT", `/api/media-items/${item}/tags`, { tagNames: ["one"] });
    expect((await get(`/api/media-items/${item}`)).json().tags).toHaveLength(1);
  });
});

describe("categories", () => {
  it("ships with the three defaults", async () => {
    const body = (await get("/api/categories")).json();
    expect(body.categories.map((c: { slug: string }) => c.slug)).toEqual([
      "video",
      "movie",
      "series",
    ]);
  });

  it("refuses a duplicate name regardless of case", async () => {
    // "Movies" already exists as a default, and differing only by case is
    // exactly how a second, identical-looking tile appeared before this check.
    expect((await send("POST", "/api/categories", { label: "movies" })).statusCode).toBe(409);

    expect((await send("POST", "/api/categories", { label: "Shorts" })).statusCode).toBe(200);
    expect((await send("POST", "/api/categories", { label: "sHoRtS" })).statusCode).toBe(409);
  });

  it("moves items to another category rather than deleting them", async () => {
    const item = await makeItem(libraryId, { title: "X", kind: "movie" });
    const movie = (await get("/api/categories")).json().categories.find(
      (c: { slug: string }) => c.slug === "movie"
    );
    const res = await send("DELETE", `/api/categories/${movie.id}`);
    expect(res.json().movedCount).toBe(1);
    expect((await get(`/api/media-items/${item}`)).statusCode).toBe(200);
  });

  it("clamps cover framing", async () => {
    const video = (await get("/api/categories")).json().categories[0];
    await send("PATCH", `/api/categories/${video.id}`, { coverScale: 50, coverPositionY: 999 });
    const after = (await get("/api/categories")).json().categories[0];
    expect(after.coverScale).toBe(100);
    expect(after.coverPositionY).toBe(100);
  });
});

describe("playback and watched state", () => {
  it("saves and returns a resume position", async () => {
    const item = await makeItem(libraryId, { title: "X", durationSeconds: 1000 });
    await send("PUT", `/api/media-items/${item}/playback`, { positionSeconds: 300 });
    expect((await get(`/api/media-items/${item}`)).json().lastPositionSeconds).toBe(300);
  });

  it("rejects a negative position", async () => {
    const item = await makeItem(libraryId, { title: "X" });
    expect(
      (await send("PUT", `/api/media-items/${item}/playback`, { positionSeconds: -5 })).statusCode
    ).toBe(400);
  });

  it("shows part-watched videos in Continue Watching", async () => {
    const item = await makeItem(libraryId, { title: "X", durationSeconds: 1000 });
    await send("PUT", `/api/media-items/${item}/playback`, { positionSeconds: 300 });
    expect((await get("/api/continue-watching")).json().items).toHaveLength(1);
  });

  it("drops a nearly-finished video out of Continue Watching", async () => {
    // 950 of 1000 is past the 92% threshold; it used to sit there forever.
    const item = await makeItem(libraryId, { title: "X", durationSeconds: 1000 });
    await send("PUT", `/api/media-items/${item}/playback`, { positionSeconds: 950 });
    expect((await get("/api/continue-watching")).json().items).toEqual([]);
  });

  it("marks watched, counts the play, and clears the resume point", async () => {
    const item = await makeItem(libraryId, { title: "X", durationSeconds: 1000 });
    await send("PUT", `/api/media-items/${item}/playback`, { positionSeconds: 300 });
    await send("PUT", `/api/media-items/${item}/watched`, { watched: true });

    const detail = (await get(`/api/media-items/${item}`)).json();
    expect(detail.watched).toBe(true);
    expect(detail.playCount).toBe(1);
    expect(detail.lastPositionSeconds).toBe(0);
    expect((await get("/api/continue-watching")).json().items).toEqual([]);
  });

  it("does not double-count re-marking something already watched", async () => {
    const item = await makeItem(libraryId, { title: "X", durationSeconds: 1000 });
    await send("PUT", `/api/media-items/${item}/watched`, { watched: true });
    await send("PUT", `/api/media-items/${item}/watched`, { watched: true });
    expect((await get(`/api/media-items/${item}`)).json().playCount).toBe(1);
  });

  it("keeps the play count when un-marking, since it is a record of what happened", async () => {
    const item = await makeItem(libraryId, { title: "X", durationSeconds: 1000 });
    await send("PUT", `/api/media-items/${item}/watched`, { watched: true });
    await send("PUT", `/api/media-items/${item}/watched`, { watched: false });

    const detail = (await get(`/api/media-items/${item}`)).json();
    expect(detail.watched).toBe(false);
    expect(detail.playCount).toBe(1);
  });
});

describe("stats", () => {
  it("counts videos without counting photos or folders as videos", async () => {
    await makeItem(libraryId, { title: "A" });
    const body = (await get("/api/stats")).json();
    expect(body.videos).toBe(1);
  });
});
