import { Pages } from "./store";

/**
 * Actual router is defined in managers/PageRouter.
 * 
 * In case independent states make more sense, this place becomes a factory
 * 
 * The router handles overlay pages and helps to organize
 * QR code direct linkes. It's very basic.
 *
 * Reminder: Scenes, QR and default modes handle the visibility of the game.
 * 404 Page Not Found does not appear here.
 * TODO: May
 */

export const router = {
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
      page: Pages.ABOUT,
      slug: "/about",
    },
    {
      page: Pages.TUTORIAL,
      slug: "/tutorial",
    },
    {
      page: Pages.ERROR,
      slug: "/error"
    },
  ],
};
