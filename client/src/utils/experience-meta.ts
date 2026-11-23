/**
 * The page's title, description and web app manifest follow the experience the address names (#343). index.html is
 * written at build time for the build's default experience (`VITE_EXPERIENCE`: its title, Onion Skin's description);
 * for another experience the app sets the title and the description from the loaded content. **Every** experience the
 * address names links its own manifest (`/api/experiences/<id>/manifest.webmanifest`, server ReaderManifest – id, start
 * and scope `/<id>/`), the default too (Tilman, 2026-11-22: "ja, ein eigenes manifest pro experience why not"), so
 * installing the app from `/osct/` or `/demo/` installs that experience. The inline script in index.html's head links
 * it before the browser reads a manifest (utils/manifest-link-html.ts); this keeps it so. An address naming none keeps
 * the build's `/manifest.webmanifest` (id and start `/` – the app installed before).
 */
import { API_URL } from "@/services/ApiService";

export interface ExperienceMeta {
  /** The experience the address names */
  experience: string | null;
  /** The build's default experience (`VITE_EXPERIENCE`) */
  fallback: string | null;
  /** The loaded content's title and the printed book's author */
  title?: string;
  author?: string;
}

/** The manifest of an experience (server ReaderManifest) */
export const experienceManifestUrl = (experience: string, apiUrl: string = API_URL): string =>
  `${apiUrl}/experiences/${encodeURIComponent(experience)}/manifest.webmanifest`;

const setMeta = (doc: Document, name: string, content: string) => {
  const meta = doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (meta) meta.content = content;
};

/**
 * Links the manifest of the experience the address names (the default too); sets the page's title, description and
 * home-screen title for an experience other than the default – returns whether it did that
 */
export const applyExperienceMeta = (doc: Document, meta: ExperienceMeta, apiUrl: string = API_URL): boolean => {
  const { experience, fallback, title, author } = meta;
  if (experience) linkManifest(doc, experienceManifestUrl(experience, apiUrl));
  if (!experience || experience === fallback) return false;
  if (title) {
    doc.title = author ? `${title} – ${author}` : title;
    setMeta(doc, "description", author ? `Augmented reality companion to ${author}'s book ${title}.` : `Augmented reality companion to ${title}.`);
    setMeta(doc, "apple-mobile-web-app-title", title);
  }
  return true;
};

/** The page's one manifest link, made when the inline script did not run */
const linkManifest = (doc: Document, href: string): void => {
  let link = doc.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = doc.createElement("link");
    link.rel = "manifest";
    doc.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
};
