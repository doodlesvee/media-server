import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Circular performer portrait.
 *
 * A video-frame source can 404 — poster existence is a filesystem check, not
 * a DB fact — so a failed load falls back to the initial rather than leaving
 * a broken image. Same approach MediaCard already takes for thumbnails.
 */
export function PerformerAvatar({
  name,
  src,
  className,
  fallbackClassName,
}: {
  name: string;
  /** Resolve with performerPortraitUrl so every caller agrees on the image. */
  src: string | null | undefined;
  className?: string;
  fallbackClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = src != null && !imageFailed;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full bg-secondary ring-1 ring-border",
        className
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          onError={() => setImageFailed(true)}
          // Posters are 16:9 and this frame is square, so the sides crop away;
          // object-top keeps faces in frame more often than centring does.
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center font-semibold text-muted-foreground",
            fallbackClassName
          )}
        >
          {name.trim()[0]?.toUpperCase() ?? "?"}
        </div>
      )}
    </div>
  );
}
