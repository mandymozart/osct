/**
 * Reader accounts (branch `database`, Tilman 2026-09-27): sign-in by email – a link and a 6-digit code,
 * no password – against the PHP API in `server/` (MySQL). Very basic: the account holds the email and
 * the sign-up options; with "save my progress" the progress record is kept on the server too.
 */

/** The sign-up options – all on by default */
export interface AccountOptions {
  /** Keep the progress record in the account (restored on other devices) */
  saveProgress: boolean;
  /** Updates on the publication (Onion Skin & Crocodile Tears) */
  bookUpdates: boolean;
  /** Updates from the publisher (Building Fictions) */
  publisherUpdates: boolean;
}

export type AccountOption = keyof AccountOptions;

/** The account as the API returns it */
export interface AccountData {
  email: string;
  language: string;
  options: AccountOptions;
  createdAt: string;
}

/** An email was sent; the reader confirms with the link or the code */
export interface PendingLogin {
  requestId: string;
  email: string;
  /** ISO time */
  expiresAt: string;
}

export type AccountStatus = "signed-out" | "pending" | "signed-in";

/**
 * Progress on the server: `synced` = the server has this device's progress, `pending` = changes wait
 * for the network, `off` = "save my progress" is off (or signed out).
 */
export type ProgressSyncStatus = "off" | "syncing" | "synced" | "pending";

/** Something the account section tells the reader once (after a link, sign-out, deletion) */
export type AccountNotice = "confirmed" | "signed-out" | "deleted" | { error: string };

export interface AccountSnapshot {
  status: AccountStatus;
  account: AccountData | null;
  pending: PendingLogin | null;
  sync: ProgressSyncStatus;
  /** A request is running (buttons disabled) */
  busy: boolean;
  notice: AccountNotice | null;
}

/** Account service (services/AccountService.ts) */
export interface IAccountService {
  /** false when the build has no API (VITE_API_URL) – the account section is hidden */
  isEnabled(): boolean;
  getSnapshot(): AccountSnapshot;
  /** Called when the snapshot changed; returns the unsubscribe function */
  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void;
  /** Send the confirmation email (a new account gets these options) */
  requestLogin(email: string, options: AccountOptions): Promise<boolean>;
  /** Confirm with the code from the email */
  confirmCode(code: string): Promise<boolean>;
  /** Back to the email form */
  cancelPending(): void;
  setOption(option: AccountOption, on: boolean): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<boolean>;
  clearNotice(): void;
}
