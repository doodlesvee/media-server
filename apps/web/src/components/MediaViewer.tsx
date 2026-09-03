import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

type Tag = { id: number; name: string; color: string | null };
type Folder = { id: number; title: string; parentId: number | null };

type VideoMetadata = {
  width?: number;
  height?: number;
  codec?: string;
  containerFormat?: string;
};

type PhotoMetadata = {
  cameraModel?: string | null;
  gps?: { latitude: number; longitude: number } | null;
};

type MediaItemDetail = {
  id: number;
  itemType: "video" | "photo" | "folder";
  title: string;
  description: string | null;
  parentId: number | null;
  playbackWarning: string | null;
  tags: Tag[];
  takenAt: string | null;
  extraMetadata: VideoMetadata | PhotoMetadata | null;
};

async function fetchItem(id: number): Promise<MediaItemDetail> {
  const res = await fetch(`/api/media-items/${id}`);
  if (!res.ok) throw new Error(`Failed to load item: ${res.status}`);
  return res.json();
}

async function updateItem(id: number, patch: { title?: string; description?: string | null }) {
  const res = await fetch(`/api/media-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update item: ${res.status}`);
}

async function fetchFolders(): Promise<{ folders: Folder[] }> {
  const res = await fetch("/api/folders");
  if (!res.ok) throw new Error(`Failed to load folders: ${res.status}`);
  return res.json();
}

async function moveToFolder(id: number, parentId: number | null) {
  const res = await fetch(`/api/media-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
  if (!res.ok) throw new Error(`Failed to move item: ${res.status}`);
}

async function saveTags(id: number, tagNames: string[]): Promise<{ tags: Tag[] }> {
  const res = await fetch(`/api/media-items/${id}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagNames }),
  });
  if (!res.ok) throw new Error(`Failed to save tags: ${res.status}`);
  return res.json();
}

function TagEditor({ itemId, tags }: { itemId: number; tags: Tag[] }) {
  const [pending, setPending] = useState<string[]>(tags.map((t) => t.name));
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    setPending(tags.map((t) => t.name));
  }, [tags]);

  const mutation = useMutation({
    mutationFn: (tagNames: string[]) => saveTags(itemId, tagNames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["collection-items"] });
    },
  });

  const dirty = JSON.stringify([...pending].sort()) !== JSON.stringify(tags.map((t) => t.name).sort());

  function addTag() {
    const name = input.trim();
    if (name && !pending.includes(name)) {
      setPending([...pending, name]);
    }
    setInput("");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending.map((name) => (
        <span
          key={name}
          className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white"
        >
          {name}
          <button
            type="button"
            onClick={() => setPending(pending.filter((n) => n !== name))}
            aria-label={`Remove tag ${name}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        placeholder="Add tag…"
        className="w-24 border-b border-white/30 bg-transparent text-xs text-white outline-none placeholder:text-white/40"
      />
      {dirty && (
        <button
          type="button"
          onClick={() => mutation.mutate(pending)}
          disabled={mutation.isPending}
          className="rounded bg-white/20 px-2 py-0.5 text-xs text-white hover:bg-white/30 disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}

function FolderPicker({ itemId, parentId }: { itemId: number; parentId: number | null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["folders"], queryFn: fetchFolders });

  const mutation = useMutation({
    mutationFn: (newParentId: number | null) => moveToFolder(itemId, newParentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
    },
  });

  if (!data || data.folders.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-white/70">
      Folder:
      <select
        value={parentId ?? ""}
        onChange={(e) => mutation.mutate(e.target.value ? Number(e.target.value) : null)}
        className="rounded border border-white/30 bg-transparent px-1 py-0.5 text-white"
      >
        <option value="" className="text-black">
          (none)
        </option>
        {data.folders.map((f) => (
          <option key={f.id} value={f.id} className="text-black">
            {f.title}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditableTitle({ itemId, title }: { itemId: number; title: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const queryClient = useQueryClient();

  useEffect(() => setValue(title), [title]);

  const mutation = useMutation({
    mutationFn: (newTitle: string) => updateItem(itemId, { title: newTitle }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      setEditing(false);
    },
  });

  function save() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) {
      mutation.mutate(trimmed);
    } else {
      setEditing(false);
      setValue(title);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            // Cancel just the edit, not the whole viewer — without this the
            // window-level Escape-to-close handler further up would also
            // fire from the same keypress and close the modal underneath.
            e.stopPropagation();
            setValue(title);
            setEditing(false);
          }
        }}
        className="border-b border-white/30 bg-transparent text-sm text-white outline-none"
      />
    );
  }

  return (
    <h2
      onClick={() => setEditing(true)}
      className="cursor-text text-sm text-white hover:underline"
      title="Click to rename"
    >
      {title}
    </h2>
  );
}

function DescriptionEditor({ itemId, description }: { itemId: number; description: string | null }) {
  const [value, setValue] = useState(description ?? "");
  const queryClient = useQueryClient();

  useEffect(() => setValue(description ?? ""), [description]);

  const mutation = useMutation({
    mutationFn: (newDescription: string) =>
      updateItem(itemId, { description: newDescription || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
    },
  });

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (description ?? "")) mutation.mutate(value);
      }}
      placeholder="Add a description…"
      rows={2}
      className="w-full resize-none rounded border border-white/20 bg-transparent p-2 text-xs text-white outline-none placeholder:text-white/40"
    />
  );
}

function formatCoords(gps: { latitude: number; longitude: number }): string {
  return `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`;
}

function TechnicalInfoPanel({ item }: { item: MediaItemDetail }) {
  if (item.itemType === "folder") return null;

  const rows: [string, string][] = [];

  if (item.itemType === "video") {
    const meta = (item.extraMetadata ?? {}) as VideoMetadata;
    if (meta.width && meta.height) rows.push(["Resolution", `${meta.width}×${meta.height}`]);
    if (meta.codec) rows.push(["Codec", meta.codec]);
    if (meta.containerFormat) rows.push(["Container", meta.containerFormat]);
  } else {
    const meta = (item.extraMetadata ?? {}) as PhotoMetadata;
    if (meta.cameraModel) rows.push(["Camera", meta.cameraModel]);
    if (meta.gps) rows.push(["Location", formatCoords(meta.gps)]);
    if (item.takenAt) rows.push(["Taken", new Date(item.takenAt).toLocaleString()]);
  }

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-white/60">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MediaViewer({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const { data: item } = useQuery({
    queryKey: ["media-item", itemId],
    queryFn: () => fetchItem(itemId),
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full max-w-4xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between text-white">
          {item ? (
            <EditableTitle itemId={item.id} title={item.title} />
          ) : (
            <h2 className="text-sm">Loading…</h2>
          )}
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        {item?.playbackWarning && (
          <p className="rounded-md bg-yellow-500/20 px-3 py-2 text-sm text-yellow-200">
            {item.playbackWarning}
          </p>
        )}

        {item &&
          (item.itemType === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- no sidecar subtitles yet, see plan Section 5
            <video
              src={`/api/stream/${item.id}`}
              controls
              autoPlay
              className="max-h-[70vh] max-w-full"
            />
          ) : (
            <img
              src={`/api/stream/${item.id}`}
              alt={item.title}
              className="max-h-[70vh] max-w-full object-contain"
            />
          ))}

        {item && <DescriptionEditor itemId={item.id} description={item.description} />}
        {item && <TechnicalInfoPanel item={item} />}
        {item && <TagEditor itemId={item.id} tags={item.tags} />}
        {item && <FolderPicker itemId={item.id} parentId={item.parentId} />}
      </div>
    </div>
  );
}
