const MY_LIST_NAME = "My List";

/** Adds an item to the "My List" collection, creating that collection on first use. */
export async function addToMyList(itemId: number): Promise<void> {
  const res = await fetch("/api/collections");
  if (!res.ok) throw new Error("Failed to load collections");
  const { collections } = (await res.json()) as {
    collections: { id: number; name: string; type: string }[];
  };

  let list = collections.find((c) => c.name === MY_LIST_NAME && c.type === "manual");
  if (!list) {
    const created = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: MY_LIST_NAME, type: "manual" }),
    });
    if (!created.ok) throw new Error("Failed to create My List");
    list = await created.json();
  }

  const added = await fetch(`/api/collections/${list!.id}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaItemId: itemId }),
  });
  if (!added.ok) throw new Error("Failed to add to My List");
}
