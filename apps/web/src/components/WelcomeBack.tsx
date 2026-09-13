import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { History, X } from "lucide-react";
import {
  clearLastSession,
  isOfferable,
  readLastSession,
  type LastSession,
} from "@/lib/lastSession";

/**
 * "Welcome back → Continue where you left off" (§3).
 *
 * Read once on mount and then held, so the prompt does not vanish mid-click
 * when the tracker records the home page you are currently looking at.
 *
 * Dismissing clears the stored session rather than hiding the banner. A
 * dismissal that left the record in place would bring the same prompt back
 * on the next visit, which turns an offer into nagging.
 */
export function WelcomeBack() {
  const navigate = useNavigate();
  const [session, setSession] = useState<LastSession | null>(null);

  useEffect(() => {
    const stored = readLastSession();
    if (isOfferable(stored)) setSession(stored);
  }, []);

  if (!session) return null;

  return (
    <div className="animate-fade-up mx-6 mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-2.5 text-sm">
      <History className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        Welcome back — you were looking at{" "}
        <span className="font-medium">{session.label}</span>.
      </span>
      <button
        type="button"
        onClick={() => {
          const [path, query = ""] = session.href.split("?");
          setSession(null);
          void navigate({
            to: path,
            search: Object.fromEntries(new URLSearchParams(query)),
          });
        }}
        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Continue
      </button>
      <button
        type="button"
        onClick={() => {
          clearLastSession();
          setSession(null);
        }}
        aria-label="Dismiss"
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
