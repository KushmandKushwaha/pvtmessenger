import { requireSameOrigin } from "@/lib/http-security";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hashSessionToken, isValidSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/anonymous";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: { publicId: session.publicId },
    });
  } catch (error) {
    logger.error("Session lookup failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ error: "Could not verify session." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (isValidSessionToken(token)) {
      await query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json({ authenticated: false });
  } catch (error) {
    logger.error("Session logout failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ error: "Could not end session." }, { status: 500 });
  }
}
