function requiredInProduction(name: string, value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (process.env.NODE_ENV === "production" && !trimmed) throw new Error(`${name} is required in production.`);
  return trimmed;
}

const optional = (value: string | undefined, fallback: string) => value?.trim() || fallback;

const rawAppOrigin = process.env.APP_ORIGIN;

export const env = {
  appName: optional(process.env.APP_NAME, "Privacy Messenger"),
  appUrl: optional(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000"),
  // Runtime-only validation is performed by requireAppOrigin(). Keeping this lazy
  // allows Next.js to statically collect API routes during `next build` without
  // requiring deployment-only environment variables at build time.
  appOrigin: rawAppOrigin?.trim(),
  logLevel: optional(process.env.LOG_LEVEL, "info"),
} as const;

function validateProductionAppUrl(): void {
  if (process.env.NODE_ENV === "production" && env.appUrl && !env.appUrl.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
  }
}

export function requireAppOrigin(): string {
  validateProductionAppUrl();
  const origin = requiredInProduction("APP_ORIGIN", env.appOrigin) ?? env.appUrl;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new Error("APP_ORIGIN must use HTTPS in production.");
  }
  return origin;
}
