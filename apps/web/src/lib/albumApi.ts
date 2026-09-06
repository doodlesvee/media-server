export type AlbumSummary = {
  id: number;
  title: string;
  performer: string | null;
  studio: string | null;
  photoCount: number;
  coverItemId: number | null;
  videoItemId: number | null;
};

export type AlbumPhoto = { id: number; title: string; thumbnailFile: string | null };

export type AlbumDetail = {
  id: number;
  title: string;
  performer: string | null;
  studio: string | null;
  video: { id: number; title: string } | null;
  photos: AlbumPhoto[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function fetchAlbums(): Promise<{ albums: AlbumSummary[] }> {
  const res = await fetch("/api/albums");
  if (!res.ok) throw new Error(`Failed to load albums: ${res.status}`);
  return res.json();
}

export async function fetchAlbum(id: number, page = 1): Promise<AlbumDetail> {
  const res = await fetch(`/api/albums/${id}?page=${page}`);
  if (!res.ok) throw new Error(`Failed to load album: ${res.status}`);
  return res.json();
}
