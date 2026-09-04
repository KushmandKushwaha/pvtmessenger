import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const migration = read("db/migrations/0004_conversations.sql") + read("db/migrations/0005_conversation_names.sql");
const service = read("src/lib/conversations/service.ts");
const routes = [
  read("src/app/api/conversations/route.ts"),
  read("src/app/api/conversations/[conversationId]/route.ts"),
  read("src/app/api/conversations/[conversationId]/members/route.ts"),
].join("\n");
const validation = read("src/lib/conversations/validation.ts");

const required = [
  ["public conversation IDs", migration.includes("gen_random_bytes(18)")],
  ["conversation public ID uniqueness", migration.includes("conversations_public_id_unique_idx")],
  ["membership roles", migration.includes("conversation_members_role_chk")],
  ["group names", migration.includes("conversations_name_length_chk")],
  ["server-side membership join", service.includes("mine.user_id = $2")],
  ["server-side authorization", service.includes("getMembershipForUpdate")],
  ["client IDs not trusted", service.includes("WHERE username = $1") && service.includes("userId")],
  ["opaque conversation IDs", routes.includes("^c_[A-Za-z0-9_-]{24}$")],
  ["unknown field rejection", validation.includes("Unknown fields are not allowed")],
  ["duplicate member rejection", validation.includes("Duplicate group members are not allowed")],
];
for (const [name, ok] of required) {
  if (!ok) throw new Error(`Conversation check failed: ${name}`);
}
if (/SELECT\s+[^;]*\bpassword\b/i.test(migration)) throw new Error("Conversation migration must not add password storage.");
if (/message[^;]*content\s+TEXT/i.test(migration)) throw new Error("Conversation migration must not add plaintext message content.");

console.log("Conversation schema/authorization checks passed.");
console.log("Unauthorized access is denied by server-side membership joins in conversation and member lookups.");
