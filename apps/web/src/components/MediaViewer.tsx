import { useEffect } from "react";
import { X } from "lucide-react";

type ViewerItem = {
  id: number;
  itemType: "video" | "photo" | "folder";
  title: string;
  playbackWarning: string | null;
};

export function MediaViewer({ item, onClose }: { item: ViewerItem; onClose: () => void }) {
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
          <h2 className="text-sm">{item.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        {item.playbackWarning && (
          <p className="rounded-md bg-yellow-500/20 px-3 py-2 text-sm text-yellow-200">
            {item.playbackWarning}
          </p>
        )}

        {item.itemType === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- no sidecar subtitles yet, see plan Section 5
          <video
            src={`/api/stream/${item.id}`}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full"
          />
        ) : (
          <img
            src={`/api/stream/${item.id}`}
            alt={item.title}
            className="max-h-[80vh] max-w-full object-contain"
          />
        )}
      </div>
    </div>
  );
}
