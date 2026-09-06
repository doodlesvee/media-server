import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AccountPage } from "@/pages/AccountPage";
import { AlbumPage } from "@/pages/AlbumPage";
import { AlbumsPage } from "@/pages/AlbumsPage";
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

const albumsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/albums",
  component: AlbumsPage,
});

const albumRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Keyed by id, like performers: an album's title comes from its folder
  // name, so renaming the folder would otherwise break every link to it.
  path: "/album/$albumId",
  component: AlbumPage,
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
  albumsRoute,
  albumRoute,
  settingsRoute,
  accountRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
