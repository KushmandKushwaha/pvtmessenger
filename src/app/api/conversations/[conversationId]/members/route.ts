import { requireSameOrigin, rateLimitAuthenticated } from "@/lib/http-security";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { addMember, listMembers, removeMember } from "@/lib/conversations/service";
import { validateMemberInput } from "@/lib/conversations/validation";

export const runtime = "nodejs";
const PUBLIC_ID = /^c_[A-Za-z0-9_-]{24}$/;

async function context(request: Request) {
  const session = await getCurrentSession();
  if (!session) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const url = new URL(request.url);
  const conversationId = url.pathname.split("/").at(-2) ?? "";
  if (!PUBLIC_ID.test(conversationId)) return { response: NextResponse.json({ error: "Invalid conversation identifier." }, { status: 400 }) };
  return { session, conversationId };
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    if ("response" in ctx) return ctx.response;
    try {
      const members = await listMembers(ctx.conversationId, ctx.session.userId);
      if (!members) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      return NextResponse.json({ members });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_MEMBER") return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      throw error;
    }
  } catch (error) {
    logger.error("Conversation member listing failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not load members." }, { status: 500 });
  }
}

async function parseMemberRequest(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return { error: NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 }) };
  let body: unknown;
  try { body = await request.json(); } catch { return { error: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }) }; }
  const validation = validateMemberInput(body);
  if (!validation.ok) return { error: NextResponse.json({ error: validation.error }, { status: 400 }) };
  return { value: validation.value };
}

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await context(request);
    if ("response" in ctx) return ctx.response;
    const rateLimit = rateLimitAuthenticated(ctx.session.userId, "mutation");
    if (rateLimit) return rateLimit;
    const parsed = await parseMemberRequest(request);
    if ("error" in parsed) return parsed.error;
    try {
      await addMember(ctx.conversationId, ctx.session.userId, parsed.value.username);
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "NOT_MEMBER" || error.message === "FORBIDDEN") return NextResponse.json({ error: "You are not permitted to modify this conversation." }, { status: 403 });
        if (error.message === "MEMBER_NOT_FOUND") return NextResponse.json({ error: "User not found." }, { status: 404 });
        if (error.message === "ALREADY_MEMBER") return NextResponse.json({ error: "User is already a member." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Conversation member addition failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not add member." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await context(request);
    if ("response" in ctx) return ctx.response;
    const rateLimit = rateLimitAuthenticated(ctx.session.userId, "mutation");
    if (rateLimit) return rateLimit;
    const parsed = await parseMemberRequest(request);
    if ("error" in parsed) return parsed.error;
    try {
      await removeMember(ctx.conversationId, ctx.session.userId, parsed.value.username);
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "NOT_MEMBER" || error.message === "FORBIDDEN") return NextResponse.json({ error: "You are not permitted to modify this conversation." }, { status: 403 });
        if (error.message === "MEMBER_NOT_FOUND") return NextResponse.json({ error: "User is not a member of this conversation." }, { status: 404 });
        if (error.message === "OWNER_CANNOT_BE_REMOVED") return NextResponse.json({ error: "The group owner cannot be removed." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Conversation member removal failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Could not remove member." }, { status: 500 });
  }
}
