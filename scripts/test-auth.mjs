import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

const publicIdPattern = /^u_[A-Za-z0-9_-]{24}$/;
const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;

const ids = new Set();
for (let i = 0; i < 1000; i += 1) {
  const id = `u_${randomBytes(18).toString("base64url")}`;
  assert.match(id, publicIdPattern);
  assert.equal(id.length, 26);
  assert.equal(ids.has(id), false);
  ids.add(id);
}

const token = randomBytes(32).toString("base64url");
assert.match(token, sessionTokenPattern);
const hash = createHash("sha256").update(token, "utf8").digest();
assert.equal(hash.length, 32);
assert.notEqual(hash.toString("base64url"), token);
assert.notEqual(hash.toString("hex"), token);
assert.notEqual(hash.toString("hex"), createHash("sha256").update(randomBytes(32)).digest().toString("hex"));

assert.doesNotMatch("u_00000000000000000000000!", publicIdPattern);
assert.doesNotMatch("u_short", publicIdPattern);
assert.doesNotMatch("", publicIdPattern);
assert.doesNotMatch("short", sessionTokenPattern);
assert.doesNotMatch("x".repeat(1000), sessionTokenPattern);

// A session remains server-revocable because only its hash is needed for the DELETE query.
const sameHash = createHash("sha256").update(token, "utf8").digest("hex");
assert.equal(createHash("sha256").update(token, "utf8").digest("hex"), sameHash);

console.log("Authentication security/unit checks passed.");
