import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Clapperboard,
  FolderOpen,
  Home,
  Images,
  Layers,
  List,
  CheckCircle2,
  TriangleAlert,
  Pin,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Tv,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateCollectionModal } from "./CreateCollectionModal";
import {
  isPinned,
  pinsChangedEvent,
  readPins,
  removePin,
  togglePin,
  type Pin as PinnedItem,
} from "@/lib/pinned";
import { useLibraryStats } from "@/lib/statsApi";

type Collection = { id: number; name: string; type: "manual" | "smart" };
type TagRow = { id: number; name: string };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  queueCount,
  queueOpen,
  onQueueToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  queueCount: number;
  queueOpen: boolean;
  onQueueToggle: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [pins, setPins] = useState<PinnedItem[]>(readPins);
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => setPins(readPins());
    window.addEventListener(pinsChangedEvent(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(pinsChangedEvent(), refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const { data: collections } = useQuery({
    queryKey: ["collections"],
    queryFn: () => fetchJson<{ collections: Collection[] }>("/api/collections"),
  });
  const { data: tagData } = useQuery({
    queryKey: ["tags"],
    queryFn: () => fetchJson<{ tags: TagRow[] }>("/api/tags"),
  });
  const { data: health } = useLibraryStats();

  const deleteCollection = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete collection");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["collections"] }),
  });

  // Collapsed, every row becomes a centred icon with no room for a label.
  const navItemClass = cn(
    "flex items-center rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
  );

  return (
    <aside
      className={cn(
        "cinema-hide focus-hide sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-card/40 transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex py-5",
          collapsed ? "flex-col items-center gap-3" : "items-center gap-2 px-5",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            !collapsed && "flex-1",
          )}
        >
          <Clapperboard className="size-5 shrink-0" />
          {!collapsed && (
            <span className="truncate text-base font-bold tracking-tight">
              Media Server
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <Link
          to="/"
          className={navItemClass}
          title={collapsed ? "Home" : undefined}
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Home className="size-4 shrink-0" />
          {!collapsed && "Home"}
        </Link>
        <Link
          to="/browse"
          className={navItemClass}
          title={collapsed ? "Browse" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <FolderOpen className="size-4 shrink-0" />
          {!collapsed && "Browse"}
        </Link>
        <Link
          to="/performers"
          className={navItemClass}
          title={collapsed ? "Performers" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Users className="size-4 shrink-0" />
          {!collapsed && "Performers"}
        </Link>
        <Link
          to="/albums"
          className={navItemClass}
          title={collapsed ? "Albums" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Images className="size-4 shrink-0" />
          {!collapsed && "Albums"}
        </Link>
        <Link
          to="/series"
          className={navItemClass}
          title={collapsed ? "Series" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Tv className="size-4 shrink-0" />
          {!collapsed && "Series"}
        </Link>

        {/* Collections and tags are text-only — collapsed they'd be a column of
            identical, unreadable icons, so the lists hide entirely. The create
            action stays, since it's the one thing that isn't recoverable by
            just expanding again. */}
        {collapsed ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            aria-label="New collection"
            title="New collection"
            className={cn(navItemClass, "mt-4 w-full")}
          >
            <Plus className="size-4 shrink-0" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between pr-2">
              <SectionLabel>Collections</SectionLabel>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                aria-label="New collection"
                className="mt-3 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {collections?.collections.length === 0 && (
              <p className="px-3 text-xs text-muted-foreground/60">None yet</p>
            )}
            {collections?.collections.map((c) => (
              <div key={c.id} className="group flex items-center">
                <Link
                  to="/browse"
                  search={{ collectionId: c.id }}
                  className={cn(navItemClass, "flex-1 truncate")}
                  activeProps={{ className: "text-foreground" }}
                >
                  <Layers className="size-4 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    togglePin({
                      id: `collection:${c.id}`,
                      type: "collection",
                      label: c.name,
                      collectionId: c.id,
                    })
                  }
                  aria-label={`${isPinned(`collection:${c.id}`) ? "Unpin" : "Pin"} ${c.name}`}
                  className="hidden rounded p-1 text-muted-foreground hover:text-foreground group-hover:block"
                >
                  <Pin
                    className={cn(
                      "size-3.5",
                      isPinned(`collection:${c.id}`) && "fill-current",
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => deleteCollection.mutate(c.id)}
                  aria-label={`Delete ${c.name}`}
                  className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}

            <SectionLabel>Tags</SectionLabel>
            {tagData?.tags.length === 0 && (
              <p className="px-3 text-xs text-muted-foreground/60">
                No tags yet
              </p>
            )}
            {tagData?.tags.map((t) => (
              <Link
                key={t.id}
                to="/browse"
                search={{ tag: t.name }}
                className={cn(navItemClass, "truncate")}
                activeProps={{ className: "text-foreground" }}
              >
                <Tag className="size-4 shrink-0" />
                <span className="truncate">{t.name}</span>
              </Link>
            ))}

            {pins.length > 0 && (
              <>
                <SectionLabel>Pinned</SectionLabel>
                {pins.map((pin) => (
                  <div key={pin.id} className="group flex items-center">
                    {pin.type === "performer" ? (
                      <Link
                        to="/performer/$performerId"
                        params={{ performerId: String(pin.performerId) }}
                        className={cn(navItemClass, "min-w-0 flex-1 truncate")}
                      >
                        <Pin className="size-4 shrink-0" />{" "}
                        <span className="truncate">{pin.label}</span>
                      </Link>
                    ) : pin.type === "studio" ? (
                      <Link
                        to="/studio/$studioId"
                        params={{ studioId: String(pin.studioId) }}
                        className={cn(navItemClass, "min-w-0 flex-1 truncate")}
                      >
                        <Pin className="size-4 shrink-0" />{" "}
                        <span className="truncate">{pin.label}</span>
                      </Link>
                    ) : (
                      <Link
                        to="/browse"
                        search={
                          pin.type === "collection"
                            ? { collectionId: pin.collectionId }
                            : { parentId: pin.folderId }
                        }
                        className={cn(navItemClass, "min-w-0 flex-1 truncate")}
                      >
                        <Pin className="size-4 shrink-0" />{" "}
                        <span className="truncate">{pin.label}</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => removePin(pin.id)}
                      aria-label={`Unpin ${pin.label}`}
                      className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-border p-2">
        <Link
          to="/settings"
          search={{ tab: "library" }}
          title={collapsed ? "Library health" : undefined}
          className={cn(navItemClass, "mb-1")}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          {health && (health.missing > 0 || health.duplicateGroups > 0) ? (
            <TriangleAlert className="size-4 shrink-0 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          )}
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate">
              {health && (health.missing > 0 || health.duplicateGroups > 0)
                ? `${health.missing + health.duplicateGroups} library issues`
                : "Library healthy"}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onQueueToggle}
          aria-label={
            queueOpen ? "Close playback queue" : "Open playback queue"
          }
          aria-expanded={queueOpen}
          title={collapsed ? "Playback queue" : undefined}
          className={cn(
            navItemClass,
            "relative w-full",
            queueOpen && "bg-accent text-foreground",
          )}
        >
          <List className="size-4 shrink-0" />
          {!collapsed && "Playback queue"}
          {queueCount > 0 && (
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground",
                collapsed ? "absolute right-1 top-1" : "ml-auto",
              )}
            >
              {queueCount}
            </span>
          )}
        </button>
        <Link
          to="/settings"
          className={navItemClass}
          title={collapsed ? "Site settings" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && "Site settings"}
        </Link>
      </div>

      {showCreate && (
        <CreateCollectionModal onClose={() => setShowCreate(false)} />
      )}
    </aside>
  );
}
