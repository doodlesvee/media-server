import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AccountPage } from "@/pages/AccountPage";
import { BrowsePage } from "@/pages/BrowsePage";
import { HomePage } from "@/pages/HomePage";
import { PerformerPage } from "@/pages/PerformerPage";
import { PerformersPage } from "@/pages/PerformersPage";
import { SettingsPage } from "@/pages/SettingsPage";

const rootRoute = createRootRoute();

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/browse",
  validateSearch: (
    search: Record<string, unknown>
  ): {
    tag?: string;
    performer?: string;
    studio?: string;
    kind?: string;
    collectionId?: number;
    q?: string;
  } => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
    performer: typeof search.performer === "string" ? search.performer : undefined,
    studio: typeof search.studio === "string" ? search.studio : undefined,
    kind: typeof search.kind === "string" ? search.kind : undefined,
    collectionId: search.collectionId != null ? Number(search.collectionId) : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: BrowsePage,
});

const performerRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Keyed by id rather than name so renaming a performer doesn't break links.
  path: "/performer/$performerId",
  component: PerformerPage,
});

const performersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/performers",
  component: PerformersPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: AccountPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  browseRoute,
  performerRoute,
  performersRoute,
  settingsRoute,
  accountRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
