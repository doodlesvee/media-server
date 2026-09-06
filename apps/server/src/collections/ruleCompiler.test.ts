import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItems, mediaItemTypes } from "../db/schema.js";
import { resetDatabase, testApp } from "../test/harness.js";
import { makeItem, makeLibrary, makePhoto } from "../test/fixtures.js";
import { compileSmartRule, type SmartRule } from "./ruleCompiler.js";

let libraryId: number;

/** Runs a compiled rule as a real query — the only way to know it is valid SQL. */
async function matching(rule: SmartRule): Promise<string[]> {
  const rows = await db
    .select({ title: mediaItems.title })
    .from(mediaItems)
    .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
    .where(and(compileSmartRule(rule)));
  return rows.map((r) => r.title).sort();
}

beforeEach(async () => {
  await testApp();
  await resetDatabase();
  ({ libraryId } = await makeLibrary());
});

describe("compileSmartRule", () => {
  it("matches on a title substring", async () => {
    await makeItem(libraryId, { title: "Hot Wife Vacation" });
    await makeItem(libraryId, { title: "Something Else" });
    expect(
      await matching({ op: "AND", conditions: [{ field: "title", op: "contains", value: "wife" }] })
    ).toEqual(["Hot Wife Vacation"]);
  });

  it("matches on item type", async () => {
    await makeItem(libraryId, { title: "A Video" });
    await makePhoto(libraryId, "A Photo");
    expect(
      await matching({ op: "AND", conditions: [{ field: "itemType", op: "eq", value: "photo" }] })
    ).toEqual(["A Photo"]);
  });

  it("requires every condition with AND", async () => {
    await makeItem(libraryId, { title: "Alpha Beta" });
    await makeItem(libraryId, { title: "Alpha Only" });
    expect(
      await matching({
        op: "AND",
        conditions: [
          { field: "title", op: "contains", value: "Alpha" },
          { field: "title", op: "contains", value: "Beta" },
        ],
      })
    ).toEqual(["Alpha Beta"]);
  });

  it("requires only one condition with OR", async () => {
    await makeItem(libraryId, { title: "Alpha" });
    await makeItem(libraryId, { title: "Beta" });
    await makeItem(libraryId, { title: "Gamma" });
    expect(
      await matching({
        op: "OR",
        conditions: [
          { field: "title", op: "contains", value: "Alpha" },
          { field: "title", op: "contains", value: "Beta" },
        ],
      })
    ).toEqual(["Alpha", "Beta"]);
  });

  it("ignores a field that is not on the allow-list", async () => {
    // The compiler must never interpolate an arbitrary field name into SQL.
    await makeItem(libraryId, { title: "Anything" });
    const rule = {
      op: "AND",
      conditions: [{ field: "passwordHash", op: "contains", value: "x" }],
    } as unknown as SmartRule;
    await expect(matching(rule)).resolves.toBeDefined();
  });

  it("does not break on a value containing SQL syntax", async () => {
    await makeItem(libraryId, { title: "Normal" });
    expect(
      await matching({
        op: "AND",
        conditions: [{ field: "title", op: "contains", value: "'; drop table media_items; --" }],
      })
    ).toEqual([]);
    // The table is still there.
    expect(await db.select().from(mediaItems)).toHaveLength(1);
  });
});
