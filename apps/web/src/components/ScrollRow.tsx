import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const arrowClass =
  "absolute top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

/**
 * A titled, horizontally-scrollable row with edge arrows.
 *
 * Holds only the scroll machinery and knows nothing about what it contains,
 * so media cards and performer cards can share it rather than each carrying
 * their own copy of the ref/listener/arrow-state logic.
 *
 * `itemCount` is passed separately from `children` because the arrow state
 * has to recompute when the contents change, and children alone give no
 * dependency to key that on.
 */
export function ScrollRow({
  title,
  itemCount,
  children,
}: {
  title: string;
  itemCount: number;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // 4px slack so sub-pixel scroll positions don't leave a dead arrow.
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scroller.current;
    el?.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el?.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows, itemCount]);

  function scrollByPage(direction: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  if (itemCount === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>

      <div className="relative">
        <div
          ref={scroller}
          className="scrollbar-hide -mx-1 flex gap-4 overflow-x-auto scroll-smooth px-1 pb-3 pt-1"
        >
          {children}
        </div>

        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label={`Scroll ${title} left`}
            className={`${arrowClass} left-0 -translate-x-1`}
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label={`Scroll ${title} right`}
            className={`${arrowClass} right-0 translate-x-1`}
          >
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
    </section>
  );
}
