// ─── Handle Validation ──────────────────────────────────────────────────────

export const HANDLE_REGEX = /^[a-zA-Z0-9_]{3,16}$/;
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 16;

// ─── Password ───────────────────────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 6;

// ─── Length Caps ────────────────────────────────────────────────────────────

export const MAX_SUBJECT = 80;
export const MAX_BODY = 4000;
export const MAX_BIO = 200;
export const MAX_CHAT = 500;
export const MAX_PRIVATE_MSG = 300;
export const MAX_SYSOP_PAGE = 200;
export const MAX_BROADCAST = 300;

// ─── Board Config Limits ────────────────────────────────────────────────────

export const BOARD_NAME_MAX = 60;
export const BOARD_TAGLINE_MAX = 120;
export const BOARD_SYSOP_MAX = 40;
export const MAX_USERS_MIN = 5;
export const MAX_USERS_MAX = 20;
export const MAX_SESSION_MINUTES_MIN = 15;
export const MAX_SESSION_MINUTES_MAX = 120;
export const SESSION_COOLDOWN_MIN = 0;
export const SESSION_COOLDOWN_MAX = 1440;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function validateHandle(handle: string): { valid: boolean; error?: string } {
  if (!handle || handle.length < HANDLE_MIN_LENGTH) {
    return { valid: false, error: `Handle must be at least ${HANDLE_MIN_LENGTH} characters.` };
  }
  if (handle.length > HANDLE_MAX_LENGTH) {
    return { valid: false, error: `Handle must be at most ${HANDLE_MAX_LENGTH} characters.` };
  }
  if (!HANDLE_REGEX.test(handle)) {
    return { valid: false, error: 'Handle must be 3-16 characters: letters, numbers, underscore.' };
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  return { valid: true };
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}
