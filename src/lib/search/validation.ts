const QUERY_MAX_LENGTH = 120;
const PAGE_SIZE_MAX = 50;
const CURSOR_MAX_LENGTH = 512;
const PUBLIC_ID = /^[A-Za-z]_[A-Za-z0-9_-]{24}$/;

export type SearchType = 'users' | 'conversations' | 'messages';

export type SearchRequest = {
  type: SearchType;
  query: string;
  limit: number;
  cursor?: string;
  conversationId?: string;
  senderUsername?: string;
  before?: string;
  after?: string;
};

export function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_QUERY');
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (normalized.length > QUERY_MAX_LENGTH) throw new Error('QUERY_TOO_LONG');
  return normalized;
}

function optionalUsername(value: string | null): string | undefined {
  if (value === null || value === '') return undefined;
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(normalized)) throw new Error('INVALID_USERNAME');
  return normalized;
}

function optionalIsoDate(value: string | null): string | undefined {
  if (value === null || value === '') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('INVALID_DATE');
  return parsed.toISOString();
}

export function validateSearchRequest(params: URLSearchParams): SearchRequest {
  const rawType = params.get('type') ?? 'messages';
  if (rawType !== 'users' && rawType !== 'conversations' && rawType !== 'messages') throw new Error('INVALID_TYPE');

  const query = normalizeSearchQuery(params.get('q') ?? '');
  if (!query) throw new Error('EMPTY_QUERY');

  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE_MAX) throw new Error('INVALID_LIMIT');

  const cursor = params.get('cursor') ?? undefined;
  if (cursor !== undefined && (cursor.length < 1 || cursor.length > CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor))) {
    throw new Error('INVALID_CURSOR');
  }

  const conversationId = params.get('conversationId') ?? undefined;
  if (conversationId !== undefined && !PUBLIC_ID.test(conversationId)) throw new Error('INVALID_CONVERSATION_ID');

  return {
    type: rawType,
    query,
    limit,
    cursor,
    conversationId,
    senderUsername: optionalUsername(params.get('senderUsername')),
    before: optionalIsoDate(params.get('before')),
    after: optionalIsoDate(params.get('after')),
  };
}

export function encodeCursor(value: Record<string, string>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined): Record<string, string> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length > 3 || Object.values(record).some((v) => typeof v !== 'string' || v.length > 128)) throw new Error();
    return record as Record<string, string>;
  } catch {
    throw new Error('INVALID_CURSOR');
  }
}

export function toLikeSearchPattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
