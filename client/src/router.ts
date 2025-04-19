/**
 * Actual router is defined in managers/PageRouter.
 *
 * In case independent states make more sense, this place becomes a factory
 *
 * The router handles overlay pages. It's very basic.
 *
 * Reminder: Scenes, QR and default modes handle the visibility of the game.
 * 404 Page Not Found does not appear here.
 */

import { PageRouterConfiguration, Pages } from "./types";

export const router: PageRouterConfiguration = {
  baseUrl: "",
  routes: [
    {
      page: Pages.HOME,
      slug: "/",
    },
    {
      page: Pages.CHAPTERS,
      slug: "/chapters",
    },
    {
      page: Pages.CHAPTER,
      slug: "/chapter",
      param: "chapterId"
    },
    {
      page: Pages.ABOUT,
      slug: "/about",
    },
    {
      page: Pages.TUTORIAL,
      slug: "/tutorial",
      param: "step"
    },
    {
      page: Pages.INDEX,
      slug: "/index",
    },
    {
      page: Pages.ERROR,
      slug: "/error",
      param: "message"
    },
  ],
};