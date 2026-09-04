import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_]{2,23}$/;
const AVATAR_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

function normalizeText(value) {
  return value.normalize("NFKC").trim();
}

function validateUsername(value) {
  if (typeof value !== "string") return null;
  const username = normalizeText(value).toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}

for (const valid of ["abc", "alice_01", "user123", "A_User_1".toLowerCase()]) {
  assert.equal(validateUsername(valid), valid.toLowerCase());
}
for (const invalid of ["ab", "-alice", "alice-name", "alice.name", "alice name", "alice!", "a".repeat(25), ""]) {
  assert.equal(validateUsername(invalid), null, invalid);
}

assert.equal(validateUsername("  Alice_01  "), "alice_01");
assert.equal(validateUsername("Ａｌｉｃｅ_01"), "alice_01");

assert.equal(AVATAR_KEY_PATTERN.test("avatars/a1/image.webp"), true);
assert.equal(AVATAR_KEY_PATTERN.test("https://example.com/a.webp"), false);
assert.equal(AVATAR_KEY_PATTERN.test("../secret"), false);
assert.equal(AVATAR_KEY_PATTERN.test("avatars/../secret"), true); // traversal is separately rejected by the API validator

const generated = new Set();
for (let i = 0; i < 5000; i += 1) {
  const key = randomBytes(24).toString("base64url");
  assert.equal(generated.has(key), false);
  generated.add(key);
}

// Database-level uniqueness is represented by the migration's unique index.
const migration = await import("node:fs/promises").then(({ readFile }) => readFile("db/migrations/0003_profiles.sql", "utf8"));
assert.match(migration, /CREATE UNIQUE INDEX users_username_unique_idx/);
assert.match(migration, /CHECK \(username IS NULL OR username ~/);
assert.match(migration, /CREATE INDEX users_username_lookup_idx/);
assert.doesNotMatch(migration, /password/i);

console.log("Profile validation/unit checks passed.");
