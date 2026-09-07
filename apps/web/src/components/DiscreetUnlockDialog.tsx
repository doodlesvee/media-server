import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { DISCREET_SHORTCUT, useAppearance } from "@/lib/appearance";
import { usePrivacyGuard } from "@/lib/privacyGuard";
import { Portal } from "./Portal";
import { PrivacyUnlockForm } from "./PrivacyUnlockForm";

/**
 * Turning discreet mode off with the same keys that turned it on.
 *
 * The shortcut arms discreet mode from anywhere; this makes it release it
 * too, which is what you'd expect from a key you already pressed once. The
 * asymmetry stays where it belongs — arming is instant and free, releasing
 * costs the password.
 *
 * Its own listener rather than logic inside the provider: releasing needs a
 * dialog, and the provider holds state, not UI. The provider's handler
 * already no-ops when discreet is on, so the two never fight over one press.
 */
export function DiscreetUnlockDialog() {
  const { discreet, set } = useAppearance();
  const [asking, setAsking] = useState(false);

  const { guarded } = usePrivacyGuard();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (event.code !== "KeyH") return;
      if (!discreet) return;

      event.preventDefault();
      // Nothing to ask for means nothing to stop you — prompting with no
      // answer would just trap you in the mode.
      if (!guarded) set({ discreet: false });
      else setAsking(true);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [discreet, guarded, set]);

  // Closes itself if the mode is turned off some other way — through the
  // appearance panel, or in another tab — rather than leaving a prompt for
  // something that already happened.
  useEffect(() => {
    if (!discreet) setAsking(false);
  }, [discreet]);

  useEffect(() => {
    if (!asking) return;
    function onKeyDown(event: KeyboardEvent) {
      // Stopped here so dismissing this doesn't also close whatever is behind
      // it — a video, most likely.
      if (event.key === "Escape") {
        event.stopPropagation();
        setAsking(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [asking]);

  if (!asking) return null;

  return (
    <Portal>
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAsking(false);
        }}
        // Above everything, including an open video: it's the only way out of
        // the mode, and a dialog you can't see is a dialog you can't answer.
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Turn off discreet mode"
          className="w-80 space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xl"
        >
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <EyeOff className="size-4" />
              Turn off discreet mode
            </h2>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {DISCREET_SHORTCUT} turns it back on at any time.
            </p>
          </div>

          <PrivacyUnlockForm
            onUnlocked={() => {
              set({ discreet: false });
              setAsking(false);
            }}
            onCancel={() => setAsking(false)}
          />
        </div>
      </div>
    </Portal>
  );
}
