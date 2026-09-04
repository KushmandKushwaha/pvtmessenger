import { createHmac, timingSafeEqual } from "node:crypto";

const TICKET_TTL_SECONDS = 60;
const VERSION = "v1";

function getSecret(): string {
  const secret = process.env.REALTIME_TICKET_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("REALTIME_TICKET_SECRET is required in production.");
  }
  return secret || "development-only-realtime-ticket-secret";
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload, "utf8").digest("base64url");
}

export function issueRealtimeTicket(sessionId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
  const payload = encode(JSON.stringify({ v: 1, sid: sessionId, exp }));
  return `${VERSION}.${payload}.${sign(payload)}`;
}

export function verifyRealtimeTicket(ticket: string): { sessionId: string } | null {
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const [, payload, signature] = parts;
  if (!payload || !signature) return null;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(payload), "base64url");
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: number; sid?: unknown; exp?: unknown };
    if (decoded.v !== 1 || typeof decoded.sid !== "string" || !decoded.sid || typeof decoded.exp !== "number") return null;
    if (!Number.isSafeInteger(decoded.exp) || decoded.exp <= Math.floor(Date.now() / 1000)) return null;
    return { sessionId: decoded.sid };
  } catch {
    return null;
  }
}

export const REALTIME_TICKET_TTL_SECONDS = TICKET_TTL_SECONDS;
