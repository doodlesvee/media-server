import { cn } from "@/lib/utils";

const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

function initialOf(value: string): string {
  const first = value.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

export function AlphabetIndex({
  value,
  onChange,
  available,
}: {
  value: string | null;
  onChange: (letter: string | null) => void;
  available: string[];
}) {
  const letters = new Set(available.map(initialOf));
  const selected = value;

  return (
    <nav
      aria-label="Filter by first letter"
      className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-b border-border/70 pb-3"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={cn(
          "min-w-8 rounded px-2 py-1 text-xs font-medium transition-colors",
          selected === null ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        All
      </button>
      {LETTERS.map((letter) => {
        const enabled = letters.has(letter);
        return (
          <button
            key={letter}
            type="button"
            onClick={() => enabled && onChange(letter)}
            disabled={!enabled}
            aria-pressed={value === letter}
            className={cn(
              "min-w-7 rounded px-1.5 py-1 text-xs font-medium transition-colors",
              selected === letter ? "bg-foreground text-background" : enabled ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "cursor-not-allowed text-muted-foreground/25"
            )}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
