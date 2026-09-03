import { and, eq, gte, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItemTags, mediaItems, mediaItemTypes, tags } from "../db/schema.js";

export type SmartCondition =
  | { field: "tags"; op: "contains"; value: string }
  | { field: "itemType"; op: "eq"; value: string }
  | { field: "itemType"; op: "in"; value: string[] }
  | { field: "createdAt"; op: "within_last_days"; value: number }
  | { field: "title"; op: "contains"; value: string };

export type SmartRule = {
  op: "AND" | "OR";
  conditions: SmartCondition[];
};

// A structured, allow-listed compiler rather than a generic expression
// evaluator: every field/op pair below maps to one specific, parameterized
// SQL shape, so a smart-collection rule can never express arbitrary SQL.
function compileCondition(condition: SmartCondition): SQL {
  switch (condition.field) {
    case "tags": {
      const matchingItemIds = db
        .select({ id: mediaItemTags.mediaItemId })
        .from(mediaItemTags)
        .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
        .where(eq(tags.name, condition.value));
      return inArray(mediaItems.id, matchingItemIds);
    }
    case "itemType": {
      // Assumes the base query already joins media_item_types (see
      // collections.ts) — this compiler only ever produces a WHERE
      // condition, not a full query, so it can't add that join itself.
      return condition.op === "eq"
        ? eq(mediaItemTypes.name, condition.value)
        : inArray(mediaItemTypes.name, condition.value);
    }
    case "createdAt": {
      const cutoff = new Date(Date.now() - condition.value * 24 * 60 * 60 * 1000);
      return gte(mediaItems.createdAt, cutoff);
    }
    case "title": {
      return ilike(mediaItems.title, `%${condition.value}%`);
    }
  }
}

export function compileSmartRule(rule: SmartRule): SQL {
  const compiled = rule.conditions.map(compileCondition);
  if (compiled.length === 0) {
    // An empty rule matches nothing, rather than everything by accident.
    return eq(mediaItems.id, -1);
  }
  return (rule.op === "OR" ? or(...compiled) : and(...compiled))!;
}
