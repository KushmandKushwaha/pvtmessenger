import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createConversation, listConversations } from "@/lib/conversations/service";
import { validateCreateConversationInput } from "@/lib/conversations/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ conversations: await listConversations(session.userId) });
  } catch (error) {
    logger.error("Conversation listing failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not load conversations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const rateLimit = rateLimitAuthenticated(session.userId, "mutation");
    if (rateLimit) return rateLimit;

    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
    }
    const length = request.headers.get("content-length");
    if (length && Number(length) > 16_384) return NextResponse.json({ error: "Request is too large." }, { status: 413 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    const validation = validateCreateConversationInput(body);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    try {
      const id = await createConversation(session.userId, validation.value);
      return NextResponse.json({ conversationId: id }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "MEMBER_NOT_FOUND") return NextResponse.json({ error: "One or more users were not found." }, { status: 404 });
      if (error instanceof Error && error.message === "SELF_MEMBER") return NextResponse.json({ error: "You cannot create a conversation with yourself." }, { status: 400 });
      throw error;
    }
  } catch (error) {
    logger.error("Conversation creation failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not create conversation." }, { status: 500 });
  }
}
