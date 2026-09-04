import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

const publicIdPattern = /^u_[A-Za-z0-9_-]{24}$/;
const publicId = `u_${randomBytes(18).toString("base64url")}`;
assert.match(publicId, publicIdPattern);
assert.equal(publicId.length, 26);
assert.ok(!publicIdPattern.test("u_too-short"));
assert.ok(!publicIdPattern.test("user_000000000000000000000000"));
assert.ok(!publicIdPattern.test("u_00000000000000000000000!"));

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token, "utf8").digest();
assert.equal(hash.length, 32);
assert.notEqual(hash.toString("base64url"), token);
assert.notEqual(createHash("sha256").update(randomBytes(32)).digest().toString("hex"), hash.toString("hex"));

console.log("Anonymous identity unit checks passed.");
