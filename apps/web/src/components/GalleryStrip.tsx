import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Images } from "lucide-react";
import { PhotoLightbox } from "./PhotoLightbox";
import { thumbnailUrl } from "@/lib/mediaItemApi";

type GalleryImage = { id: number; title: string; thumbnailFile: string | null };

async function fetchGallery(
  itemId: number
): Promise<{ albumId: number | null; images: GalleryImage[] }> {
  const res = await fetch(`/api/media-items/${itemId}/gallery`);
  if (!res.ok) throw new Error(`Failed to load gallery: ${res.status}`);
  return res.json();
}

/**
 * The stills that live in the same folder as this video.
 *
 * A strip rather than a grid, because the modal is about the video — the full
 * set is one click away on the album page, which is where you'd go to actually
 * look through 121 photos.
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

  if (images.length === 0) return null;

  return (
    <div className="space-y-2 px-6 pb-6">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Gallery
        </h3>
        <span className="text-[11px] text-muted-foreground/70">{images.length} images</span>
        {data?.albumId != null && (
          <Link
            to="/album/$albumId"
            params={{ albumId: String(data.albumId) }}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Images className="size-3.5" />
            Open album
          </Link>
        )}
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
        <PhotoLightbox
          photos={images}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}
