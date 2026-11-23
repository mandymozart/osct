// The reader's side of the desktop landing (#355): when a visitor gets it, where its data comes from, its links and the
// reader's language. The page itself – markup, styles, mount and hero – is the landing piece in ui/landing/ (#356),
// which the editor shows too. The page's entry (entry.ts) is loaded by index.html, never through this barrel.
export * from "./data";
export * from "./desktop-visitor";
export * from "./links";
export * from "./texts";
