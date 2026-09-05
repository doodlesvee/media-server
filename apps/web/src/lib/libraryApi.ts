export type LibraryRoot = {
  id: number;
  libraryId: number;
  path: string;
  files: number;
  /** False for a root left over from a previous MEDIA_ROOT — unscannable. */
  reachable: boolean;
};

export type BrowseRoot = { name: string; path: string };
export type RootsResponse = {
  mediaRoot: string;
  browseRoots: BrowseRoot[];
  roots: LibraryRoot[];
};

export type BrowseResponse = {
  /** Null at the top level, where the entries are the mount points. */
  path: string | null;
  parent: string | null;
  directories: { name: string; path: string }[];
};

export async function fetchRoots(): Promise<RootsResponse> {
  const res = await fetch("/api/library/roots");
  if (!res.ok) throw new Error(`Failed to load folders: ${res.status}`);
  return res.json();
}

export async function browseFolders(dir?: string): Promise<BrowseResponse> {
  const query = dir ? `?path=${encodeURIComponent(dir)}` : "";
  const res = await fetch(`/api/library/browse${query}`);
  if (!res.ok) throw new Error(`Failed to browse: ${res.status}`);
  return res.json();
}

export async function addRoot(dirPath: string): Promise<void> {
  const res = await fetch("/api/library/roots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dirPath }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Failed to add folder: ${res.status}`);
  }
}

export async function removeRoot(id: number): Promise<void> {
  const res = await fetch(`/api/library/roots/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove folder: ${res.status}`);
}
