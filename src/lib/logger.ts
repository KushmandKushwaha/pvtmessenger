export type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (process.env.LOG_LEVEL?.trim().toLowerCase() || "info") as LogLevel;
const threshold = levels[configuredLevel] ?? levels.info;
const SENSITIVE_KEY = /(password|passwd|token|secret|authorization|cookie|set-cookie|private.?key|access.?key|ciphertext|plaintext|message.?content|search.?query|querystring|endpoint)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[TRUNCATED]";
  if (value instanceof Error) return { name: value.name };
  if (typeof value === "string") return value.length > 2048 ? `${value.slice(0, 2048)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(item, depth + 1);
    }
    return output;
  }
  return value;
}

function write(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  if (levels[level] < threshold) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(metadata ? { metadata: sanitize(metadata) } : {}),
  };

  const serialized = JSON.stringify(entry);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>) => write("debug", message, metadata),
  info: (message: string, metadata?: Record<string, unknown>) => write("info", message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => write("warn", message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => write("error", message, metadata),
};
