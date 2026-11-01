/** The admin page's user filters (docs/admin.md): everyone, a role, or the newsletter list */
export type UserFilter = "all" | "editor" | "admin" | "newsletter";

/** The admin page's CSV button: its label, its tooltip and whether it downloads the newsletter list */
export interface CsvDownload {
  label: string;
  title: string;
  newsletter: boolean;
}

/**
 * The CSV the admin page offers under a filter: every user under *All*, the newsletter list (the users with an update
 * option on) under *Newsletter*, none under *Editors* or *Admins* – the API has no role CSV, and the newsletter list
 * there would not be what the filter shows.
 */
export const csvDownload = (filter: UserFilter): CsvDownload | null => {
  if (filter === "all") return { label: "Users CSV", title: "Every user as CSV", newsletter: false };
  if (filter === "newsletter") return { label: "Newsletter CSV", title: "The users with an update option on, as CSV – the newsletter list", newsletter: true };
  return null;
};
