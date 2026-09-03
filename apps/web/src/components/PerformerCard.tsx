import { performerPortraitUrl } from "@/lib/performerApi";
import { PerformerAvatar } from "./PerformerAvatar";

export type PerformerSummary = {
  id: number;
  name: string;
  hasImage: boolean;
  hasBanner: boolean;
  videoCount: number;
  representativeItemId: number | null;
};

export function PerformerCard({
  performer,
  onClick,
}: {
  performer: PerformerSummary;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-24 shrink-0 focus-visible:outline-none sm:w-28"
    >
      <PerformerAvatar
        name={performer.name}
        src={performerPortraitUrl(performer)}
        className="aspect-square w-full transition-all duration-200 group-hover:ring-2 group-hover:ring-white/60 group-focus-visible:ring-2 group-focus-visible:ring-white"
        fallbackClassName="text-2xl"
      />

      <span className="mt-2 block truncate text-center text-xs font-medium transition-colors group-hover:text-white">
        {performer.name}
      </span>
      <span className="block text-center text-[11px] text-muted-foreground">
        {performer.videoCount} {performer.videoCount === 1 ? "video" : "videos"}
      </span>
    </button>
  );
}
