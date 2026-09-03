import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

type HealthResponse = {
  status: string;
  db: boolean;
};

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}

function HealthCheckPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="rounded-lg border border-border p-6 text-center">
        <h1 className="mb-4 text-xl font-semibold">Media Server</h1>
        {isLoading && <p className="text-muted-foreground">Checking server health…</p>}
        {error && <p className="text-destructive">Could not reach the server.</p>}
        {data && (
          <div className="space-y-1 text-sm">
            <p>
              API status: <span className="font-mono">{data.status}</span>
            </p>
            <p>
              Database connected:{" "}
              <span className="font-mono">{data.db ? "yes" : "no"}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const rootRoute = createRootRoute();

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HealthCheckPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
