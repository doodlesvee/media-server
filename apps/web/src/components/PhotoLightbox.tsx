import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Portal } from "./Portal";

export type LightboxPhoto = { id: number; title: string };

/**
 * Full-screen photo viewer, shared by the in-video gallery strip and the
 * album page.
 *
 * Extracted rather than copied: the keyboard handling below is subtle enough
 * that two versions would drift, and the album page needs exactly the same
 * behaviour.
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  onReachEnd,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  /**
   * Called when stepping near the end of what's loaded, so the caller can
   * fetch more. Without it an album of 121 photos dead-ends at whatever the
   * first page happened to contain.
   */
  onReachEnd?: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stops the detail modal's own Escape handler closing everything at
        // once — one press should close one layer.
        event.stopPropagation();
        onClose();
      }
      if (event.key === "ArrowRight") onIndexChange((index + 1) % photos.length);
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + photos.length) % photos.length);
    }

    // Capture phase, so this runs before any window-level listener behind it.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [index, photos.length, onIndexChange, onClose]);

  // Ask for more while there is still a little runway, so stepping forward
  // doesn't stall at the boundary.
  useEffect(() => {
    if (onReachEnd && index >= photos.length - 3) onReachEnd();
  }, [index, photos.length, onReachEnd]);

  const photo = photos[index];
  if (!photo) return null;

  // The neighbours, fetched by the browser but never shown. Stepping through
  // a gallery is the one time you know exactly what comes next, so waiting
  // for it to download is avoidable.
  const neighbours = [photos[index + 1], photos[index - 1]].filter(Boolean);

  const step = (delta: number) => onIndexChange((index + delta + photos.length) % photos.length);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Photo"
      >
        {/* The full file, not the thumbnail. */}
        <img
          src={`/api/stream/${photo.id}`}
          alt={photo.title}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded object-contain"
        />

        {neighbours.map((neighbour) => (
          <link key={neighbour.id} rel="preload" as="image" href={`/api/stream/${neighbour.id}`} />
        ))}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <X className="size-5" />
        </button>

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous photo"
              className="absolute left-4 flex size-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next photo"
              className="absolute right-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronRight className="size-6" />
            </button>
            <span className="absolute bottom-6 rounded-full bg-black/70 px-3 py-1 text-xs text-white backdrop-blur-sm">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
    </Portal>
  );
}
