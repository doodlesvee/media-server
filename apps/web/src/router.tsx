import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { MediaGrid } from "@/components/MediaGrid";
import { RescanButton } from "@/components/RescanButton";

function LibraryPage() {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Media Server</h1>
          <RescanButton />
        </div>
        <MediaGrid />
      </div>
    </div>
  );
}

const rootRoute = createRootRoute();

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
