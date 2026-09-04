import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { getProfileByUserId, updateProfile } from "@/lib/profile/service";
import { validateProfileInput } from "@/lib/profile/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const profile = await getProfileByUserId(session.userId);
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    return NextResponse.json({ profile });
  } catch (error) {
    logger.error("Profile lookup failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
    if (rateLimit) return rateLimit;

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > 8_192) {
      return NextResponse.json({ error: "Profile request is too large." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const validation = validateProfileInput(body);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    try {
      const profile = await updateProfile(session.userId, validation.value);
      if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
      return NextResponse.json({ profile });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: "That username is already in use." }, { status: 409 });
      }
      if (error instanceof Error && error.message === "INVALID_AVATAR_REFERENCE") {
        return NextResponse.json({ error: "Invalid avatar reference." }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Profile update failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not update profile." }, { status: 500 });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
