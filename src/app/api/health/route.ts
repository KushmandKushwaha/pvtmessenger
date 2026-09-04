import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export function GET() {
  try {
    logger.info("Health check requested");
    return NextResponse.json({ status: "ok", service: env.appName });
  } catch (error) {
    logger.error("Health check failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
