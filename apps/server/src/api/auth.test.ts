import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, testApp } from "../test/harness.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
});

// `payload` is typed as an object rather than unknown: with unknown,
// TypeScript cannot pick the right `inject` overload and every call to the
// result loses its type.
const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {} });

describe("first-run setup", () => {
  it("reports that setup is needed when there is no account", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/auth/status" })).json();
    expect(body.needsSetup).toBe(true);
    expect(body.user).toBeNull();
  });

  it("creates the first account and signs you in", async () => {
    const res = await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("refuses a second account", async () => {
    await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
    const res = await post("/api/auth/setup", { username: "other", password: "long-enough-pw" });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a password shorter than the minimum", async () => {
    expect((await post("/api/auth/setup", { username: "me", password: "short" })).statusCode).toBe(
      400
    );
  });
});

describe("login", () => {
  beforeEach(async () => {
    await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
  });

  it("accepts the right password", async () => {
    const res = await post("/api/auth/login", { username: "me", password: "long-enough-pw" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a wrong password without saying which half was wrong", async () => {
    const wrongPassword = await post("/api/auth/login", { username: "me", password: "nope-nope" });
    const wrongUser = await post("/api/auth/login", { username: "nobody", password: "nope-nope" });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongUser.statusCode).toBe(401);
    // Identical responses: a different message would let someone probe for
    // valid usernames.
    expect(wrongPassword.json()).toEqual(wrongUser.json());
  });

  it("sets an httpOnly cookie so scripts cannot read the session", async () => {
    const res = await post("/api/auth/login", { username: "me", password: "long-enough-pw" });
    const cookies = String(res.headers["set-cookie"]);
    expect(cookies.toLowerCase()).toContain("httponly");
    expect(cookies.toLowerCase()).toContain("samesite=lax");
  });
});

describe("session lifetime", () => {
  it("stops working after logout", async () => {
    await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
    const login = await post("/api/auth/login", { username: "me", password: "long-enough-pw" });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];

    expect((await app.inject({ url: "/api/media-items", headers: { cookie } })).statusCode).toBe(
      200
    );
    await post("/api/auth/logout", {}, cookie);
    expect((await app.inject({ url: "/api/media-items", headers: { cookie } })).statusCode).toBe(
      401
    );
  });
});
