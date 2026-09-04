const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_]{2,23}$/;
const AVATAR_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const DISPLAY_NAME_MAX_LENGTH = 64;
export const BIO_MAX_LENGTH = 160;
export const AVATAR_STORAGE_KEY_MAX_LENGTH = 512;

export type ProfileInput = {
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarStorageKey?: string | null;
};

export type ValidatedProfileInput = {
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarStorageKey?: string | null;
};

export type ValidationResult =
  | { ok: true; value: ValidatedProfileInput }
  | { ok: false; error: string };

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim();
}

function validateOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
  allowNull = true,
): { value?: string | null; error?: string } {
  if (value === undefined) return {};
  if (value === null && allowNull) return { value: null };
  if (typeof value !== "string") return { error: `${field} must be a string or null.` };

  const normalized = normalizeText(value);
  if (!normalized) return { error: `${field} cannot be empty.` };
  if (normalized.length > maxLength) return { error: `${field} is too long.` };
  return { value: normalized };
}

export function validateProfileInput(input: unknown): ValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const record = input as Record<string, unknown>;
  const allowed = new Set(["username", "displayName", "bio", "avatarStorageKey"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return { ok: false, error: `Unknown profile field: ${key}.` };
  }

  const result: ValidatedProfileInput = {};

  if ("username" in record) {
    if (record.username === null) {
      result.username = null;
    } else if (typeof record.username === "string") {
      const username = normalizeText(record.username).toLowerCase();
      if (!USERNAME_PATTERN.test(username)) {
        return {
          ok: false,
          error: "Username must be 3-24 characters using lowercase letters, numbers, and underscores, and must start with a letter or number.",
        };
      }
      result.username = username;
    } else {
      return { ok: false, error: "Username must be a string or null." };
    }
  }

  const displayName = validateOptionalText(record.displayName, "Display name", DISPLAY_NAME_MAX_LENGTH);
  if (displayName.error) return { ok: false, error: displayName.error };
  if ("value" in displayName) result.displayName = displayName.value;

  const bio = validateOptionalText(record.bio, "Bio", BIO_MAX_LENGTH);
  if (bio.error) return { ok: false, error: bio.error };
  if ("value" in bio) result.bio = bio.value;

  if ("avatarStorageKey" in record) {
    if (record.avatarStorageKey === null) {
      result.avatarStorageKey = null;
    } else if (typeof record.avatarStorageKey === "string") {
      const key = normalizeText(record.avatarStorageKey);
      if (!AVATAR_KEY_PATTERN.test(key) || key.includes("..")) {
        return { ok: false, error: "Avatar reference is invalid." };
      }
      result.avatarStorageKey = key;
    } else {
      return { ok: false, error: "Avatar reference must be a string or null." };
    }
  }

  if (Object.keys(result).length === 0) {
    return { ok: false, error: "At least one profile field is required." };
  }

  return { ok: true, value: result };
}

export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_PATTERN.test(value);
}
