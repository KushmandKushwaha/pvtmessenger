const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_]{2,23}$/;
const MAX_GROUP_NAME_LENGTH = 80;
const MAX_MEMBERS = 100;

export type CreateConversationInput =
  | { kind: "direct"; username: string }
  | { kind: "group"; name: string; usernames: string[] };

export type MemberInput = { username: string };

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return USERNAME_PATTERN.test(normalized) ? normalized : null;
}

function validateObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCreateConversationInput(input: unknown):
  | { ok: true; value: CreateConversationInput }
  | { ok: false; error: string } {
  if (!validateObject(input)) return { ok: false, error: "Request body must be an object." };
  if (typeof input.kind !== "string") return { ok: false, error: "Conversation kind is required." };

  if (input.kind === "direct") {
    const allowed = new Set(["kind", "username"]);
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      return { ok: false, error: "Unknown fields are not allowed." };
    }
    const username = normalizeUsername(input.username);
    if (!username) return { ok: false, error: "A valid username is required." };
    return { ok: true, value: { kind: "direct", username } };
  }

  if (input.kind !== "group") return { ok: false, error: "Conversation kind must be direct or group." };
  const allowed = new Set(["kind", "name", "usernames"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unknown fields are not allowed." };
  }
  if (typeof input.name !== "string") return { ok: false, error: "Group name is required." };
  const name = input.name.normalize("NFKC").trim();
  if (name.length < 1 || name.length > MAX_GROUP_NAME_LENGTH) {
    return { ok: false, error: "Group name must be 1-80 characters." };
  }
  if (!Array.isArray(input.usernames) || input.usernames.length < 1 || input.usernames.length > MAX_MEMBERS - 1) {
    return { ok: false, error: "A group must include 1-99 other members." };
  }
  const usernames: string[] = [];
  for (const raw of input.usernames) {
    const username = normalizeUsername(raw);
    if (!username) return { ok: false, error: "Every member must have a valid username." };
    if (!usernames.includes(username)) usernames.push(username);
  }
  if (usernames.length !== input.usernames.length) {
    return { ok: false, error: "Duplicate group members are not allowed." };
  }
  return { ok: true, value: { kind: "group", name, usernames } };
}

export function validateMemberInput(input: unknown): { ok: true; value: MemberInput } | { ok: false; error: string } {
  if (!validateObject(input)) return { ok: false, error: "Request body must be an object." };
  if (Object.keys(input).some((key) => key !== "username")) return { ok: false, error: "Unknown fields are not allowed." };
  const username = normalizeUsername(input.username);
  if (!username) return { ok: false, error: "A valid username is required." };
  return { ok: true, value: { username } };
}
