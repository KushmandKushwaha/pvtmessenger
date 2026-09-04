import { requireSameOrigin } from "@/lib/http-security";
import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import {
  generatePublicId,
  generateSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_COOKIE_SECURE,
} from "@/lib/auth/anonymous";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

function getRateLimitKey(request: Request): string {
  // Only trust proxy-provided client IPs when the deployment explicitly declares a trusted proxy.
  // Otherwise an attacker can spoof X-Forwarded-For and bypass the signup limit.
  const trustedProxy = process.env.TRUST_PROXY === "true";
  const forwarded = trustedProxy ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return `anonymous-signup:${forwarded || "untrusted-client"}`;
}

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const rateLimit = checkRateLimit(getRateLimitKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many account creation attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
      return NextResponse.json(
        { error: "Anonymous account creation does not accept a request body." },
        { status: 400 },
      );
    }

    const body = await request.text();
    if (body.trim().length > 0) {
      return NextResponse.json(
        { error: "Anonymous account creation does not accept a request body." },
        { status: 400 },
      );
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const publicId = generatePublicId();

      try {
        const result = await withTransaction(async (client) => {
          const user = await client.query<{ id: string; public_id: string }>(
            `INSERT INTO users (public_id) VALUES ($1) RETURNING id, public_id`,
            [publicId],
          );

          const device = await client.query<{ id: string }>(
            `INSERT INTO devices (user_id, last_seen_at) VALUES ($1, NOW()) RETURNING id`,
            [user.rows[0].id],
          );

          const session = await client.query<{ id: string }>(
            `
              INSERT INTO sessions (user_id, device_id, token_hash, expires_at)
              VALUES ($1, $2, $3, $4)
              RETURNING id
            `,
            [user.rows[0].id, device.rows[0].id, tokenHash, expiresAt],
          );

          return { publicId: user.rows[0].public_id, sessionId: session.rows[0].id };
        });

        const response = NextResponse.json(
          { user: { publicId: result.publicId }, session: { expiresAt: expiresAt.toISOString() } },
          { status: 201 },
        );

        response.cookies.set({
          name: SESSION_COOKIE_NAME,
          value: token,
          httpOnly: true,
          secure: SESSION_COOKIE_SECURE,
          sameSite: "lax",
          path: "/",
          maxAge: Math.floor(SESSION_DURATION_MS / 1000),
        });

        logger.info("Anonymous account created");
        return response;
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 2) continue;
        throw error;
      }
    }

    return NextResponse.json({ error: "Could not create anonymous account." }, { status: 503 });
  } catch (error) {
    logger.error("Anonymous account creation failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ error: "Could not create anonymous account." }, { status: 500 });
  }
}
