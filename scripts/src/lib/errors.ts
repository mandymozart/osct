// Content errors collected during the build. Any error fails the build before files are written.
export const buildErrors: string[] = [];

// Content warnings: reported, the build goes on (e.g. a video kept out of git that is not on this machine).
export const buildWarnings: string[] = [];

/** What a caught value says: an Error's message, anything else thrown (a string, a number) as text */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
