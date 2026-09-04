import { query, withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";

export type ConversationSummary = {
  id: string;
  kind: "direct" | "group";
  name: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
};

export type ConversationMember = {
  username: string | null;
  displayName: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
};

type UserRow = { id: string; username: string };
type ConversationRow = {
  id: string;
  kind: "direct" | "group";
  name: string | null;
  created_at: string;
  updated_at: string;
  member_count: string;
};

function mapConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberCount: Number(row.member_count),
  };
}

export async function createConversation(
  userId: string,
  input: { kind: "direct"; username: string } | { kind: "group"; name: string; usernames: string[] },
): Promise<string> {
  return withTransaction(async (client) => {
    const usernames = input.kind === "direct" ? [input.username] : input.usernames;
    const users = await client.query<UserRow>(
      `SELECT id, username FROM users WHERE username = ANY($1::text[]) AND username IS NOT NULL`,
      [usernames],
    );
    if (users.rows.length !== usernames.length) throw new Error("MEMBER_NOT_FOUND");

    const targetIds = users.rows.map((row) => row.id);
    if (targetIds.includes(userId)) throw new Error("SELF_MEMBER");

    if (input.kind === "direct") {
      const existing = await client.query<{ public_id: string }>(
        `
          SELECT c.public_id
          FROM conversations c
          INNER JOIN conversation_members cm ON cm.conversation_id = c.id
          WHERE c.kind = 'direct'
            AND cm.user_id = ANY($1::uuid[])
          GROUP BY c.id, c.public_id
          HAVING COUNT(*) = 2
             AND COUNT(*) FILTER (WHERE cm.user_id = $2) = 1
             AND COUNT(*) FILTER (WHERE cm.user_id = $3) = 1
          LIMIT 1
        `,
        [[userId, targetIds[0]], userId, targetIds[0]],
      );
      if (existing.rows[0]) return existing.rows[0].public_id;
    }

    const conversation = await client.query<{ id: string; public_id: string }>(
      `
        INSERT INTO conversations (kind, name, created_by, updated_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, public_id
      `,
      [input.kind, input.kind === "group" ? input.name : null, userId],
    );

    const conversationId = conversation.rows[0].id;
    const memberRows = [
      { userId, role: input.kind === "group" ? "owner" : "member" },
      ...targetIds.map((id) => ({ userId: id, role: "member" })),
    ];
    for (const member of memberRows) {
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, $3)`,
        [conversationId, member.userId, member.role],
      );
    }
    return conversation.rows[0].public_id;
  });
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const result = await query<ConversationRow>(
    `
      SELECT c.public_id AS id, c.kind, c.name,
             c.created_at, c.updated_at,
             COUNT(cm2.user_id)::text AS member_count
      FROM conversations c
      INNER JOIN conversation_members mine
        ON mine.conversation_id = c.id AND mine.user_id = $1
      INNER JOIN conversation_members cm2
        ON cm2.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT 100
    `,
    [userId],
  );
  return result.rows.map(mapConversation);
}

export async function getConversationForMember(publicId: string, userId: string): Promise<ConversationSummary | null> {
  const result = await query<ConversationRow>(
    `
      SELECT c.public_id AS id, c.kind, c.name,
             c.created_at, c.updated_at,
             COUNT(cm2.user_id)::text AS member_count
      FROM conversations c
      INNER JOIN conversation_members mine
        ON mine.conversation_id = c.id AND mine.user_id = $2
      INNER JOIN conversation_members cm2
        ON cm2.conversation_id = c.id
      WHERE c.public_id = $1
      GROUP BY c.id
      LIMIT 1
    `,
    [publicId, userId],
  );
  return result.rows[0] ? mapConversation(result.rows[0]) : null;
}

export async function addMember(publicId: string, actorUserId: string, username: string): Promise<void> {
  await withTransaction(async (client) => {
    const conversation = await getMembershipForUpdate(client, publicId, actorUserId);
    if (!conversation) throw new Error("NOT_MEMBER");
    if (conversation.kind !== "group" || (conversation.role !== "owner" && conversation.role !== "admin")) {
      throw new Error("FORBIDDEN");
    }

    const target = await client.query<UserRow>(`SELECT id, username FROM users WHERE username = $1 LIMIT 1`, [username]);
    if (!target.rows[0]) throw new Error("MEMBER_NOT_FOUND");
    if (target.rows[0].id === actorUserId) throw new Error("ALREADY_MEMBER");

    const inserted = await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [conversation.conversationId, target.rows[0].id],
    );
    if (inserted.rowCount === 0) throw new Error("ALREADY_MEMBER");
    await client.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversation.conversationId]);
  });
}

export async function removeMember(publicId: string, actorUserId: string, username: string): Promise<void> {
  await withTransaction(async (client) => {
    const conversation = await getMembershipForUpdate(client, publicId, actorUserId);
    if (!conversation) throw new Error("NOT_MEMBER");
    if (conversation.kind !== "group") throw new Error("FORBIDDEN");

    const target = await client.query<UserRow>(`SELECT id, username FROM users WHERE username = $1 LIMIT 1`, [username]);
    if (!target.rows[0]) throw new Error("MEMBER_NOT_FOUND");
    if (target.rows[0].id === conversation.ownerUserId) throw new Error("OWNER_CANNOT_BE_REMOVED");

    const targetMembership = await client.query<{ role: "owner" | "admin" | "member" }>(
      `SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversation.conversationId, target.rows[0].id],
    );
    if (!targetMembership.rows[0]) throw new Error("MEMBER_NOT_FOUND");

    if (target.rows[0].id !== actorUserId) {
      if (conversation.role !== "owner" && conversation.role !== "admin") throw new Error("FORBIDDEN");
      if (conversation.role !== "owner" && targetMembership.rows[0].role === "admin") throw new Error("FORBIDDEN");
    }

    await client.query(
      `DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversation.conversationId, target.rows[0].id],
    );
    await client.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversation.conversationId]);
  });
}

export async function listMembers(publicId: string, userId: string): Promise<ConversationMember[] | null> {
  const result = await query<ConversationMember>(
    `
      SELECT u.username, u.display_name AS "displayName", cm.role,
             cm.joined_at AS "joinedAt"
      FROM conversation_members cm
      INNER JOIN conversations c ON c.id = cm.conversation_id
      INNER JOIN conversation_members mine
        ON mine.conversation_id = c.id AND mine.user_id = $2
      INNER JOIN users u ON u.id = cm.user_id
      WHERE c.public_id = $1
      ORDER BY cm.joined_at ASC
    `,
    [publicId, userId],
  );
  if (!result.rows.length) {
    const exists = await query(`SELECT 1 FROM conversations WHERE public_id = $1 LIMIT 1`, [publicId]);
    if (exists.rows.length) throw new Error("NOT_MEMBER");
    return null;
  }
  return result.rows;
}

async function getMembershipForUpdate(client: PoolClient, publicId: string, userId: string) {
  const result = await client.query<{
    conversationId: string;
    kind: "direct" | "group";
    role: "owner" | "admin" | "member";
    ownerUserId: string | null;
  }>(
    `
      SELECT c.id AS "conversationId", c.kind, mine.role,
             COALESCE(
               (SELECT cm.user_id FROM conversation_members cm
                WHERE cm.conversation_id = c.id AND cm.role = 'owner' LIMIT 1),
               c.created_by
             ) AS "ownerUserId"
      FROM conversations c
      INNER JOIN conversation_members mine
        ON mine.conversation_id = c.id AND mine.user_id = $2
      WHERE c.public_id = $1
      FOR UPDATE OF c, mine
      LIMIT 1
    `,
    [publicId, userId],
  );
  return result.rows[0] ?? null;
}
