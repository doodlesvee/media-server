import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
});

async function save(body: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: "/api/appearance",
    headers: { cookie },
    payload: body,
  });
}

async function load() {
  const res = await app.inject({
    method: "GET",
    url: "/api/appearance",
    headers: { cookie },
  });
  return (res.json() as { appearance: Record<string, unknown> }).appearance;
}

describe("appearance settings", () => {
  // The allowlist is the whole point of this endpoint, and forgetting to
  // extend it is silent: the setting works until it round-trips the server,
  // then reverts with nothing logged anywhere.
  it("keeps the two banner heights apart", async () => {
    await save({ heroHeight: 90, bannerHeight: 40 });
    expect(await load()).toMatchObject({ heroHeight: 90, bannerHeight: 40 });
  });

  it("stores the preview-on-open preference", async () => {
    await save({ modalPreview: false });
    expect(await load()).toMatchObject({ modalPreview: false });
  });

  it("clamps a height to the range the slider offers", async () => {
    await save({ heroHeight: 5000, bannerHeight: -20 });
    expect(await load()).toMatchObject({ heroHeight: 100, bannerHeight: 30 });
  });

  it("drops a key it does not recognise rather than failing the save", async () => {
    const res = await save({ heroHeight: 55, somethingElse: "nonsense" });
    expect(res.statusCode).toBe(200);
    const stored = await load();
    expect(stored).toMatchObject({ heroHeight: 55 });
    expect(stored).not.toHaveProperty("somethingElse");
  });

  it("ignores a height that is not a number", async () => {
    await save({ heroHeight: "tall" });
    expect(await load()).not.toHaveProperty("heroHeight");
  });
});
