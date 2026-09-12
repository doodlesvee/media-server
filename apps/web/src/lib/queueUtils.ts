import type { QueueItem } from "./queue";

export function appendUnique(items: QueueItem[], item: QueueItem): QueueItem[] {
  return items.some((entry) => entry.id === item.id) ? items : [...items, item];
}

export function prependUnique(
  items: QueueItem[],
  item: QueueItem,
): QueueItem[] {
  return items.some((entry) => entry.id === item.id) ? items : [item, ...items];
}

export function moveQueueItem(
  items: QueueItem[],
  id: number,
  direction: -1 | 1,
): QueueItem[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
