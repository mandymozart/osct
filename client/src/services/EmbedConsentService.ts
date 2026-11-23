/**
 * The reader's consent to content from other sites (#351): a Links entry's YouTube / Vimeo player or embedded page
 * loads only after the reader agreed – once (that entry, this time) or always for that provider (YouTube, Vimeo, a
 * site's host). "Always" is kept per device in localStorage and taken back in Info → Settings (`<settings-embeds>`);
 * nothing goes to the server.
 *
 * Standalone (no store dependency), like `SubtitleService`.
 */

export const EMBED_CONSENT_STORAGE_KEY = "osct-embed-consent";

export class EmbedConsentService {
  private static instance: EmbedConsentService | null = null;

  static getInstance(): EmbedConsentService {
    if (!EmbedConsentService.instance) EmbedConsentService.instance = new EmbedConsentService();
    return EmbedConsentService.instance;
  }

  private allowed: Set<string> = this.load();
  private listeners = new Set<() => void>();

  /** Whether content of this provider loads without asking */
  isAllowed(provider: string): boolean {
    return this.allowed.has(provider);
  }

  /** The providers that load without asking, in the order they were allowed */
  list(): string[] {
    return [...this.allowed];
  }

  /** Load this provider's content from now on without asking */
  allow(provider: string): void {
    if (this.allowed.has(provider)) return;
    this.allowed.add(provider);
    this.save();
  }

  /** Ask again before this provider's content loads */
  revoke(provider: string): void {
    if (!this.allowed.delete(provider)) return;
    this.save();
  }

  /** Called when the list changes; returns the unsubscribe function */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private save(): void {
    try {
      localStorage.setItem(EMBED_CONSENT_STORAGE_KEY, JSON.stringify([...this.allowed]));
    } catch {
      // Private mode / blocked storage: the choice holds for this session only
    }
    this.listeners.forEach(listener => listener());
  }

  private load(): Set<string> {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(EMBED_CONSENT_STORAGE_KEY) ?? "[]");
      return new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : []);
    } catch {
      return new Set();
    }
  }
}
