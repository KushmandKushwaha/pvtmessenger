import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { issueRealtimeTicket, REALTIME_TICKET_TTL_SECONDS } from "@/lib/realtime/ticket";
import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const rateLimit = rateLimitAuthenticated(session.userId, "realtime-ticket", 30, 60_000);
    if (rateLimit) return rateLimit;

    return NextResponse.json(
      { ticket: issueRealtimeTicket(session.sessionId), expiresIn: REALTIME_TICKET_TTL_SECONDS },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("Realtime ticket issuance failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ error: "Could not establish realtime connection." }, { status: 500 });
  }
}
