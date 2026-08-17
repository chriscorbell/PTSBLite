export type SessionStoreResult = { ok: true } | { ok: false; error: string };

export type SessionStore = {
  load: () => string | null;
  store: (json: string) => SessionStoreResult;
  clear: () => void;
  /** Set aside a payload this build cannot read without overwriting an earlier backup. */
  preserveUnreadable: () => void;
};

export type Platform = {
  session: SessionStore;
  savePdf: (bytes: Uint8Array, suggestedName: string) => Promise<{ error?: string }>;
};
