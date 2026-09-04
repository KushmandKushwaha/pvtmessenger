import { NextResponse } from "next/server";
import { getProfileByUsername } from "@/lib/profile/service";
import { isValidUsername } from "@/lib/profile/validation";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const normalized = decodeURIComponent(username).normalize("NFKC").trim().toLowerCase();

    if (!isValidUsername(normalized)) {
      return NextResponse.json({ error: "Invalid username." }, { status: 400 });
    }

    const profile = await getProfileByUsername(normalized);
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    return NextResponse.json({ profile });
  } catch (error) {
    logger.error("Public profile lookup failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  }
}
