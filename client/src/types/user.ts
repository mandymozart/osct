/**
 * Reader accounts: passwordless email sign-in (link or 6-digit code) against the PHP API in `server/`.
 * An account holds the email, the update options and the progress record.
 */

/**
 * Update options are opt-in: off until the reader enables them. Progress is always stored in the
 * account (restored on other devices) and can be reset.
 */
export interface UserOptions {
  /** Updates on the publication (Onion Skin & Crocodile Tears) */
  bookUpdates: boolean;
  /** Updates from the artist (the book's author) */
  artistUpdates: boolean;
  /** Updates from the publisher */
  publisherUpdates: boolean;
}

export type UserOption = keyof UserOptions;

/** The user as returned by the API */
export interface UserData {
  email: string;
  language: string;
  options: UserOptions;
  createdAt: string;
}

/** An email was sent; the reader confirms with the link or the code */
export interface PendingLogin {
  requestId: string;
  email: string;
  /** ISO time */
  expiresAt: string;
}

export type UserStatus = "signed-out" | "pending" | "signed-in";

/**
 * Progress on the server: `synced` = the server has this device's progress, `pending` = changes wait
 * for the network, `off` = signed out.
 */
export type ProgressSyncStatus = "off" | "syncing" | "synced" | "pending";

/** Something the account section tells the reader once (after a link, sign-out, deletion) */
export type UserNotice = "confirmed" | "signed-out" | "deleted" | { error: string };

export interface UserSnapshot {
  status: UserStatus;
  user: UserData | null;
  pending: PendingLogin | null;
  sync: ProgressSyncStatus;
  /** A request is running (buttons disabled) */
  busy: boolean;
  notice: UserNotice | null;
}

/** Account API client (services/UserService.ts); publishes `UserSnapshot` to subscribers */
export interface IUserService {
  /** false when the build has no API (VITE_API_URL) – the account section is hidden */
  isEnabled(): boolean;
  getSnapshot(): UserSnapshot;
  /** Called when the snapshot changed; returns the unsubscribe function */
  subscribe(listener: (snapshot: UserSnapshot) => void): () => void;
  /** Send the confirmation email; a new user gets these update options (existing users keep theirs) */
  requestLogin(email: string, options: UserOptions): Promise<boolean>;
  /** Confirm with the code from the email */
  confirmCode(code: string): Promise<boolean>;
  /** Back to the email form */
  cancelPending(): void;
  setOption(option: UserOption, on: boolean): Promise<void>;
  signOut(): Promise<void>;
  deleteUser(): Promise<boolean>;
  clearNotice(): void;
}
