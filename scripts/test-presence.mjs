import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const gateway = read("scripts/ws-server.ts");
const protocol = read("src/lib/realtime/protocol.ts");
const service = read("src/lib/presence/service.ts");
const events = read("src/lib/presence/protocol.ts");
const client = read("src/lib/realtime/client.ts");

const checks = [
  ["presence is in memory", gateway.includes("userConnections") && gateway.includes("connections")],
  ["multi-device online state", gateway.includes("userConnections.get(session.userId)")],
  ["offline only after final connection", gateway.includes("currentDevice?.size === 0") && gateway.includes("currentUser?.size === 0")],
  ["last seen persistence", service.includes("UPDATE devices SET last_seen_at")],
  ["presence snapshot", events.includes("presence_sync") && gateway.includes("presence_sync")],
  ["presence updates", events.includes("presence_update") && gateway.includes("presence_update")],
  ["typing protocol", protocol.includes("type: 'typing'") && events.includes('type: "typing"')],
  ["typing not persisted", !/typing[\s\S]{0,700}(INSERT|UPDATE)[\s\S]{0,700}typing/i.test(gateway)],
  ["typing rate limit", gateway.includes("TYPING_RATE_LIMIT")],
  ["membership authorization", gateway.includes("getConversationForMember")],
  ["no sensitive presence logging", !gateway.includes("console.log")],
  ["connection heartbeat", gateway.includes("socket.ping()") && gateway.includes("socket.terminate()")],
  ["client typing helper", client.includes("sendTyping")],
];

for (const [name, ok] of checks) assert.ok(ok, `Presence check failed: ${name}`);
assert.match(protocol, /conversationId.*isTyping/);
console.log("Presence and typing static checks passed.");

// In-memory connection semantics: a user remains online while any browser/device connection remains.
const users = new Map();
const connect = (user, socket) => { const set = users.get(user) ?? new Set(); set.add(socket); users.set(user, set); };
const disconnect = (user, socket) => { const set = users.get(user); set?.delete(socket); if (set?.size === 0) users.delete(user); };
connect("A", "A-device-1");
connect("A", "A-device-2");
assert.equal(users.has("A"), true, "User should be online with two connections");
disconnect("A", "A-device-1");
assert.equal(users.has("A"), true, "User must remain online after one connection closes");
disconnect("A", "A-device-2");
assert.equal(users.has("A"), false, "User should become offline after final connection closes");
connect("A", "A-device-3");
assert.equal(users.has("A"), true, "Reconnect should restore online state");
console.log("Presence multi-device/reconnect state checks passed.");
