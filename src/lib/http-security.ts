import { requireAppOrigin } from './env';
import { checkRateLimit } from './auth/rate-limit';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSameOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(requireAppOrigin()).origin;
  } catch {
    return false;
  }
}

export function requireSameOrigin(request: Request): Response | null {
  if (isSameOrigin(request)) return null;
  return new Response(JSON.stringify({ error: 'Cross-site request rejected.' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new Error('INVALID_CONTENT_TYPE');
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) throw new Error('BODY_TOO_LARGE');
  }
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('INVALID_JSON'); }
}


export function rateLimitAuthenticated(userId: string, scope: string, limit = 120, windowMs = 60_000): Response | null {
  const result = checkRateLimit(`api:${scope}:${userId}`, limit, windowMs);
  if (result.allowed) return null;
  return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': String(result.retryAfterSeconds) },
  });
}
