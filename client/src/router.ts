/**
 * Route table. Navigation is done by `RouterManager` (store/managers/router).
 *
 * Views = routes → pages (one exclusive page, one param). Each route declares the game mode it
 * belongs to; `navigate()` sets route and mode in one update (PLAN Phase 2 "Modes vs views").
 * Routes without a mode (error, not-found) are overlays and keep the current mode.
 * URLs: services/LinkService.ts (/<slug>/<param value>?osct=<version>). `/spread` has no route param at
 * runtime (the active spread is `state.currentSpread`); `spreadId` names it in links.
 */

import { GameMode, PageRouterConfiguration, Pages } from "./types";

export const router: PageRouterConfiguration = {
  baseUrl: "",
  routes: [
    {
      page: Pages.HOME,
      slug: "/",
      mode: GameMode.IDLE,
    },
    {
      page: Pages.SPREAD,
      slug: "/spread",
      mode: GameMode.SCAN,
      param: "spreadId"
    },
    {
      page: Pages.ABOUT,
      slug: "/about",
      mode: GameMode.CONSULTATION,
    },
    {
      page: Pages.TUTORIAL,
      slug: "/tutorial",
      mode: GameMode.IDLE,
      param: "step"
    },
    {
      // Entries list (design p.17–29), param = category (default: the last one)
      page: Pages.ENTRIES,
      slug: "/entries",
      mode: GameMode.CONSULTATION,
      param: "category"
    },
    {
      // Entry detail (design p.15, 20, 25, 30–31)
      page: Pages.ENTRY,
      slug: "/entry",
      mode: GameMode.CONSULTATION,
      param: "entryId"
    },
    {
      page: Pages.ERROR,
      slug: "/error",
    },
    {
      page: Pages.NOT_FOUND,
      slug: "/not-found",
    },
  ],
};