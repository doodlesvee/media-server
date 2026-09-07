import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StudioCard } from "@/components/StudioCard";
import { fetchStudios } from "@/lib/studioApi";

export function StudiosPage() {
  const { data, isLoading } = useQuery({ queryKey: ["studios"], queryFn: fetchStudios });
  const studios = data?.studios ?? [];

  // Zero-video studios are kept, matching the performers page: one exists
  // because a filename named it, and it comes back the moment that folder is
  // scanned again.
  const withVideos = studios.filter((s) => s.videoCount > 0);
  const empty = studios.filter((s) => s.videoCount === 0);

  return (
    <AppShell
      title="Studios"
      subtitle={
        studios.length > 0
          ? `${studios.length} ${studios.length === 1 ? "studio" : "studios"}`
          : undefined
      }
    >
      <div className="space-y-8 px-6 py-6">
        {isLoading && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton aspect-video rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && studios.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No studios yet. They're picked up from a filename's leading [Studio] tag, or from
            the folder above your videos, when you scan.
          </p>
        )}

        {withVideos.length > 0 && (
          <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {withVideos.map((studio) => (
              <StudioCard key={studio.id} studio={studio} />
            ))}
          </div>
        )}

        {empty.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
              No videos right now
            </h2>
            <p className="max-w-prose text-xs text-muted-foreground/70">
              Their folder isn't currently being scanned. Nothing about them is lost.
            </p>
            <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {empty.map((studio) => (
                <StudioCard key={studio.id} studio={studio} />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
