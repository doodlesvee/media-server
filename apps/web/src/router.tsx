import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RouteErrorFallback } from "@/components/RouteErrorFallback";
import { AccountPage } from "@/pages/AccountPage";
import { AlbumPage } from "@/pages/AlbumPage";
import { AlbumsPage } from "@/pages/AlbumsPage";
import { BrowsePage } from "@/pages/BrowsePage";
import { HelpPage } from "@/pages/HelpPage";
import { HomePage } from "@/pages/HomePage";
import { PerformerPage } from "@/pages/PerformerPage";
import { PerformersPage } from "@/pages/PerformersPage";
import { StudioPage } from "@/pages/StudioPage";
import { StudiosPage } from "@/pages/StudiosPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SeriesPage } from "@/pages/SeriesPage";
import { SeriesPageIndex } from "@/pages/SeriesPageIndex";

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
    search: Record<string, unknown>,
  ): {
    tag?: string;
    performer?: string;
    studio?: string;
    kind?: string;
    collectionId?: number;
    parentId?: number;
    sort?: string;
    year?: number;
    q?: string;
  } => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
    performer:
      typeof search.performer === "string" ? search.performer : undefined,
    studio: typeof search.studio === "string" ? search.studio : undefined,
    kind: typeof search.kind === "string" ? search.kind : undefined,
    collectionId:
      search.collectionId != null ? Number(search.collectionId) : undefined,
    parentId: search.parentId != null ? Number(search.parentId) : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
    year: search.year != null ? Number(search.year) : undefined,
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

const seriesIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series",
  component: SeriesPageIndex,
});

const seriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/series/$seriesId",
  component: SeriesPage,
});

const albumRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Keyed by id, like performers: an album's title comes from its folder
  // name, so renaming the folder would otherwise break every link to it.
  path: "/album/$albumId",
  component: AlbumPage,
});

const studiosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/studios",
  component: StudiosPage,
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Keyed by id, like performers and albums: a studio's name is derived from
  // filenames, so a rename would otherwise break every link to it.
  path: "/studio/$studioId",
  component: StudioPage,
});

const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/help",
  component: HelpPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  // In the URL rather than component state: settings pages are where you
  // reload after changing something, and coming back to the first tab every
  // time would undo the point of splitting them up.
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
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
  seriesIndexRoute,
  seriesRoute,
  albumRoute,
  studiosRoute,
  studioRoute,
  helpRoute,
  settingsRoute,
  accountRoute,
]);

export const router = createRouter({
  routeTree,
  defaultErrorComponent: RouteErrorFallback,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
