import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { getConversationForMember } from "@/lib/conversations/service";

export const runtime = "nodejs";

const PUBLIC_ID = /^c_[A-Za-z0-9_-]{24}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { conversationId } = await params;
    if (!PUBLIC_ID.test(conversationId)) return NextResponse.json({ error: "Invalid conversation identifier." }, { status: 400 });

    const conversation = await getConversationForMember(conversationId, session.userId);
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    return NextResponse.json({ conversation });
  } catch (error) {
    logger.error("Conversation lookup failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not load conversation." }, { status: 500 });
  }
}
