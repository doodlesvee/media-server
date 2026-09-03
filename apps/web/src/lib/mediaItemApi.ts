export type Tag = { id: number; name: string; color: string | null };
export type Performer = { id: number; name: string };
export type Folder = { id: number; title: string; parentId: number | null };

export type VideoMetadata = {
  width?: number;
  height?: number;
  codec?: string;
  containerFormat?: string;
};

export type PhotoMetadata = {
  cameraModel?: string | null;
  gps?: { latitude: number; longitude: number } | null;
};

export type MediaItemDetail = {
  id: number;
  itemType: "video" | "photo" | "folder";
  title: string;
  description: string | null;
  performers: Performer[];
  performersSource: "scanner" | "user";
  parentId: number | null;
  durationSeconds: number | null;
  playbackWarning: string | null;
  tags: Tag[];
  takenAt: string | null;
  createdAt: string;
  extraMetadata: VideoMetadata | PhotoMetadata | null;
  lastPositionSeconds: number;
};

export async function fetchItem(id: number): Promise<MediaItemDetail> {
  const res = await fetch(`/api/media-items/${id}`);
  if (!res.ok) throw new Error(`Failed to load item: ${res.status}`);
  return res.json();
}

export async function updateItem(
  id: number,
  patch: { title?: string; description?: string | null }
) {
  const res = await fetch(`/api/media-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update item: ${res.status}`);
}

export async function fetchFolders(): Promise<{ folders: Folder[] }> {
  const res = await fetch("/api/folders");
  if (!res.ok) throw new Error(`Failed to load folders: ${res.status}`);
  return res.json();
}

export async function moveToFolder(id: number, parentId: number | null) {
  const res = await fetch(`/api/media-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
  if (!res.ok) throw new Error(`Failed to move item: ${res.status}`);
}

export async function savePerformers(
  id: number,
  performerNames: string[]
): Promise<{ performers: Performer[] }> {
  const res = await fetch(`/api/media-items/${id}/performers`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ performerNames }),
  });
  if (!res.ok) throw new Error(`Failed to save performers: ${res.status}`);
  return res.json();
}

export async function saveTags(id: number, tagNames: string[]): Promise<{ tags: Tag[] }> {
  const res = await fetch(`/api/media-items/${id}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagNames }),
  });
  if (!res.ok) throw new Error(`Failed to save tags: ${res.status}`);
  return res.json();
}

// Fire-and-forget by design at call sites — losing an occasional progress
// tick isn't worth surfacing an error for, unlike the edit actions above.
export async function savePlaybackPosition(id: number, positionSeconds: number): Promise<void> {
  await fetch(`/api/media-items/${id}/playback`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ positionSeconds }),
  });
}
