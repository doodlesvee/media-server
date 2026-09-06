import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * How many overlays are currently open.
 *
 * Ref-counted because they nest: the gallery lightbox opens on top of the
 * detail modal, and closing the inner one must not unlock the page while the
 * outer is still covering it.
 */
let openOverlays = 0;
let restoreOverflow = "";
let restorePaddingRight = "";

function lockScroll(): void {
  openOverlays += 1;
  if (openOverlays > 1) return;

  const { body } = document;
  restoreOverflow = body.style.overflow;
  restorePaddingRight = body.style.paddingRight;

  // Removing the scrollbar would otherwise let the page jump sideways as it
  // reclaims that width. Only pads when a scrollbar actually takes up space —
  // it's zero for the overlay scrollbars macOS uses by default.
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  body.style.overflow = "hidden";
}

function unlockScroll(): void {
  openOverlays = Math.max(0, openOverlays - 1);
  if (openOverlays > 0) return;

  document.body.style.overflow = restoreOverflow;
  document.body.style.paddingRight = restorePaddingRight;
}

/**
 * Renders children at the end of <body>, outside the page's layout, and holds
 * the page still underneath them.
 *
 * Overlays need the portal. `position: fixed` and a high z-index are not
 * enough on their own: any ancestor with a transform, filter, or an animated
 * opacity creates a stacking context, and a child's z-index is then only
 * meaningful *inside* it. `<main>` carries `animate-fade-in`, which animates
 * opacity, so every modal rendered inside it was confined below the sticky
 * header — z-50 lost to the header's z-30 because they were never being
 * compared.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
