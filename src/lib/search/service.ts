import { query } from '@/lib/db';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { decodeCursor, encodeCursor, toLikeSearchPattern, type SearchRequest } from './validation';

const SEARCH_LIMIT = 60;
const SEARCH_WINDOW_MS = 60_000;

export type UserSearchResult = {
  publicId: string;
  username: string;
  displayName: string | null;
};

export type ConversationSearchResult = {
  publicId: string;
  kind: 'direct' | 'group';
  name: string | null;
  matchedMembers: Array<{ username: string | null; displayName: string | null }>;
};

export type MessageSearchResult = {
  messageId: string;
  conversationId: string;
  sender: { publicId: string; username: string | null; displayName: string | null };
  contentSnippet: string;
  createdAt: string;
  editedAt: string | null;
};

export type SearchResult =
  | { type: 'users'; items: UserSearchResult[]; nextCursor: string | null }
  | { type: 'conversations'; items: ConversationSearchResult[]; nextCursor: string | null }
  | { type: 'messages'; items: MessageSearchResult[]; nextCursor: string | null };

export function checkSearchRateLimit(userId: string) {
  return checkRateLimit(`search:${userId}`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
}

export async function search(userId: string, request: SearchRequest): Promise<SearchResult> {
  if (request.type === 'users') return searchUsers(request);
  if (request.type === 'conversations') return searchConversations(userId, request);
  return searchMessages(userId, request);
}

async function searchUsers(request: SearchRequest): Promise<SearchResult> {
  const cursor = decodeCursor(request.cursor);
  const pattern = toLikeSearchPattern(request.query);
  const result = await query<{ public_id: string; username: string; display_name: string | null }>(
    `SELECT public_id, username, display_name
     FROM users
     WHERE username IS NOT NULL
       AND (username ILIKE '%' || $1 || '%' ESCAPE '\\' OR display_name ILIKE '%' || $1 || '%' ESCAPE '\\')
       AND ($2::text IS NULL OR username > $2)
     ORDER BY username ASC
     LIMIT $3`,
    [pattern, cursor?.username ?? null, request.limit + 1],
  );
  const rows = result.rows.slice(0, request.limit);
  return {
    type: 'users',
    items: rows.map((row) => ({ publicId: row.public_id, username: row.username, displayName: row.display_name })),
    nextCursor: rows.length === request.limit ? encodeCursor({ username: rows[rows.length - 1].username }) : null,
  };
}

async function searchConversations(userId: string, request: SearchRequest): Promise<SearchResult> {
  const cursor = decodeCursor(request.cursor);
  const pattern = toLikeSearchPattern(request.query);
  const result = await query<{
    public_id: string;
    kind: 'direct' | 'group';
    name: string | null;
    matched_members: Array<{ username: string | null; displayName: string | null }>;
  }>(
    `SELECT c.public_id, c.kind, c.name,
            COALESCE((
              SELECT json_agg(json_build_object('username', u.username, 'displayName', u.display_name)
                              ORDER BY u.username)
              FROM conversation_members cm_match
              INNER JOIN users u ON u.id = cm_match.user_id
              WHERE cm_match.conversation_id = c.id
                AND (u.username ILIKE '%' || $2 || '%' ESCAPE '\\' OR u.display_name ILIKE '%' || $2 || '%' ESCAPE '\\')
            ), '[]'::json) AS matched_members
     FROM conversations c
     INNER JOIN conversation_members mine
       ON mine.conversation_id = c.id AND mine.user_id = $1
     WHERE ($2::text IS NULL OR c.name ILIKE '%' || $2 || '%' ESCAPE '\\'
            OR EXISTS (
              SELECT 1
              FROM conversation_members cm_match
              INNER JOIN users u ON u.id = cm_match.user_id
              WHERE cm_match.conversation_id = c.id
                AND (u.username ILIKE '%' || $2 || '%' ESCAPE '\\' OR u.display_name ILIKE '%' || $2 || '%' ESCAPE '\\')
            ))
       AND ($3::text IS NULL OR c.public_id > $3)
     ORDER BY c.public_id ASC
     LIMIT $4`,
    [userId, pattern, cursor?.publicId ?? null, request.limit + 1],
  );
  const rows = result.rows.slice(0, request.limit);
  return {
    type: 'conversations',
    items: rows.map((row) => ({
      publicId: row.public_id,
      kind: row.kind,
      name: row.name,
      matchedMembers: row.matched_members ?? [],
    })),
    nextCursor: rows.length === request.limit ? encodeCursor({ publicId: rows[rows.length - 1].public_id }) : null,
  };
}

async function searchMessages(userId: string, request: SearchRequest): Promise<SearchResult> {
  const cursor = decodeCursor(request.cursor);
  const result = await query<{
    message_id: string;
    conversation_id: string;
    public_id: string;
    username: string | null;
    display_name: string | null;
    search_content: string;
    created_at: string;
    edited_at: string | null;
  }>(
    `SELECT m.id AS message_id,
            c.public_id AS conversation_id,
            u.public_id,
            u.username,
            u.display_name,
            m.search_content,
            m.created_at,
            m.edited_at
     FROM messages m
     INNER JOIN conversations c ON c.id = m.conversation_id
     INNER JOIN conversation_members viewer
       ON viewer.conversation_id = c.id AND viewer.user_id = $1
     INNER JOIN devices sender_device ON sender_device.id = m.sender_device_id
     INNER JOIN users u ON u.id = sender_device.user_id
     WHERE m.search_content IS NOT NULL
       AND m.search_vector @@ plainto_tsquery('simple', $2)
       AND ($3::text IS NULL OR c.public_id = $3)
       AND ($4::text IS NULL OR u.username = $4)
       AND ($5::timestamptz IS NULL OR m.created_at >= $5)
       AND ($6::timestamptz IS NULL OR m.created_at < $6)
       AND ($7::timestamptz IS NULL OR (m.created_at, m.id) < ($7::timestamptz, $8::uuid))
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $9`,
    [
      userId,
      request.query,
      request.conversationId ?? null,
      request.senderUsername ?? null,
      request.after ?? null,
      request.before ?? null,
      cursor?.createdAt ?? null,
      cursor?.messageId ?? null,
      request.limit + 1,
    ],
  );
  const rows = result.rows.slice(0, request.limit);
  return {
    type: 'messages',
    items: rows.map((row) => ({
      messageId: row.message_id,
      conversationId: row.conversation_id,
      sender: { publicId: row.public_id, username: row.username, displayName: row.display_name },
      contentSnippet: row.search_content.length > 240 ? `${row.search_content.slice(0, 240)}…` : row.search_content,
      createdAt: row.created_at,
      editedAt: row.edited_at,
    })),
    nextCursor: rows.length === request.limit
      ? encodeCursor({ createdAt: rows[rows.length - 1].created_at, messageId: rows[rows.length - 1].message_id })
      : null,
  };
}
