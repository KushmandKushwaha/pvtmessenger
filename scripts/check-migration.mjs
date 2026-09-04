import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const directory = join(process.cwd(), "db", "migrations");
const files = readdirSync(directory).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();

if (files.length < 3) throw new Error("Expected the initial, anonymous identity, and profile migrations.");
if (files[0] !== "0001_initial.sql" || files[1] !== "0002_anonymous_identity.sql" || files[2] !== "0003_profiles.sql") {
  throw new Error(`Unexpected migration ordering: ${files.join(", ")}`);
}

const sql = files.map((file) => readFileSync(join(directory, file), "utf8")).join("\n");
const required = [
  "CREATE TABLE users",
  "CREATE TABLE devices",
  "CREATE TABLE conversations",
  "CREATE TABLE conversation_members",
  "CREATE TABLE messages",
  "CREATE TABLE attachments",
  "ADD COLUMN public_id",
  "CREATE TABLE sessions",
  "token_hash BYTEA NOT NULL UNIQUE",
  "ADD COLUMN username",
  "ADD COLUMN display_name",
  "ADD COLUMN bio",
  "ADD COLUMN avatar_storage_key",
  "CREATE UNIQUE INDEX users_username_unique_idx",
  "CREATE INDEX users_username_lookup_idx",
];

for (const marker of required) {
  if (!sql.includes(marker)) throw new Error(`Missing migration marker: ${marker}`);
}

if (/password/i.test(sql)) throw new Error("Migrations must not introduce plaintext password storage.");
if (/\bmessage_content\s+TEXT/i.test(sql)) throw new Error("Migrations must not introduce an unapproved plaintext message content column.");
const attachmentTable = sql.match(/CREATE TABLE attachments[\s\S]*?(?=CREATE INDEX attachments_message_id_idx|$)/i)?.[0] ?? "";
if (/\bBYTEA\b/i.test(attachmentTable)) throw new Error("Attachments must not store file bytes in PostgreSQL.");

console.log(`Migration checks passed (${files.length} migrations).`);
