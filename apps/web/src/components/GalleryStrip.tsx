import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { thumbnailUrl } from "@/lib/mediaItemApi";

type GalleryImage = { id: number; title: string; thumbnailFile: string | null };

async function fetchGallery(itemId: number): Promise<{ images: GalleryImage[] }> {
  const res = await fetch(`/api/media-items/${itemId}/gallery`);
  if (!res.ok) throw new Error(`Failed to load gallery: ${res.status}`);
  return res.json();
}

/**
 * The stills that live in the same folder as this video.
 *
 * They're deliberately not library items — a studio folder holds a scene and
 * its gallery, and listing a dozen numbered JPEGs beside the videos buries
 * the videos. Here they're what they actually are: pictures belonging to the
 * thing you're already looking at.
 */
export function GalleryStrip({ itemId }: { itemId: number }) {
  const { data } = useQuery({
    queryKey: ["gallery", itemId],
    queryFn: () => fetchGallery(itemId),
  });
  const images = data?.images ?? [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Reset when the modal swaps to another item, or the lightbox would reopen
  // on an index belonging to the previous video's gallery.
  useEffect(() => setOpenIndex(null), [itemId]);

  useEffect(() => {
    if (openIndex === null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stops the detail modal's own Escape handler closing everything at
        // once — one press should close one layer.
        event.stopPropagation();
        setOpenIndex(null);
      }
      if (event.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
      if (event.key === "ArrowLeft") {
        setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
      }
    }

    // Capture phase, so this runs before the modal's window-level listener.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openIndex, images.length]);

  if (images.length === 0) return null;

  const step = (delta: number) =>
    setOpenIndex((i) => (i === null ? i : (i + delta + images.length) % images.length));

  return (
    <div className="space-y-2 px-6 pb-6">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Gallery
        </h3>
        <span className="text-[11px] text-muted-foreground/70">{images.length} images</span>
      </div>

      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {images.map((image, index) => (
          <li key={image.id} className="w-48 shrink-0 snap-start sm:w-56">
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`Open image ${index + 1} of ${images.length}`}
              className="group w-full"
            >
              <img
                src={thumbnailUrl(image)}
                alt=""
                loading="lazy"
                className="aspect-video w-full rounded object-cover ring-1 ring-border transition-all group-hover:ring-white/40"
              />
            </button>
          </li>
        ))}
      </ul>

      {openIndex !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpenIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Gallery image"
        >
          {/* The full file, not the thumbnail — same endpoint the photo
              lightbox uses elsewhere. */}
          <img
            src={`/api/stream/${images[openIndex].id}`}
            alt={images[openIndex].title}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded object-contain"
          />

          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            aria-label="Close image"
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            <X className="size-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous image"
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
                aria-label="Next image"
                className="absolute right-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <ChevronRight className="size-6" />
              </button>
              <span className="absolute bottom-6 rounded-full bg-black/70 px-3 py-1 text-xs text-white backdrop-blur-sm">
                {openIndex + 1} / {images.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
