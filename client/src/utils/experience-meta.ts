/**
 * The page's title, description and web app manifest follow the experience the address names (#343). index.html is
 * written at build time for the build's default experience (`VITE_EXPERIENCE`: its title, Onion Skin's description,
 * the build's manifest `/manifest.webmanifest` – id and start `/`); for another experience the app sets the title and
 * the description from the loaded content and links the experience's own manifest (`/api/experiences/<id>/
 * manifest.webmanifest`, server ReaderManifest – id, start and scope `/<id>/`), so installing the app from `/demo/`
 * installs the demo. The default experience keeps what the build wrote (the desktop landing and the app installed
 * before #343 rely on it).
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

/** The manifest of an experience other than the build's default (server ReaderManifest) */
export const experienceManifestUrl = (experience: string, apiUrl: string = API_URL): string =>
  `${apiUrl}/experiences/${encodeURIComponent(experience)}/manifest.webmanifest`;

const setMeta = (doc: Document, name: string, content: string) => {
  const meta = doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (meta) meta.content = content;
};

/** Sets the page's title, description, home-screen title and manifest for an experience other than the default; returns whether it did */
export const applyExperienceMeta = (doc: Document, meta: ExperienceMeta, apiUrl: string = API_URL): boolean => {
  const { experience, fallback, title, author } = meta;
  if (!experience || experience === fallback) return false;
  if (title) {
    doc.title = author ? `${title} – ${author}` : title;
    setMeta(doc, "description", author ? `Augmented reality companion to ${author}'s book ${title}.` : `Augmented reality companion to ${title}.`);
    setMeta(doc, "apple-mobile-web-app-title", title);
  }
  const link = doc.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = experienceManifestUrl(experience, apiUrl);
  return true;
};
