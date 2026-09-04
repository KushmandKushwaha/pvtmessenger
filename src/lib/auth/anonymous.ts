import { createHash, randomBytes } from "node:crypto";

export const ANONYMOUS_PUBLIC_ID_PREFIX = "u_";
export const ANONYMOUS_PUBLIC_ID_LENGTH = 26;
export const SESSION_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-session" : "session";
export const SESSION_COOKIE_SECURE = process.env.NODE_ENV === "production";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function generatePublicId(): string {
  return `${ANONYMOUS_PUBLIC_ID_PREFIX}${randomBytes(18).toString("base64url")}`;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function isValidSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isValidPublicId(value: unknown): value is string {
  return typeof value === "string" && /^u_[A-Za-z0-9_-]{24}$/.test(value);
}
