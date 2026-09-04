import { query } from "@/lib/db";
import type { ValidatedProfileInput } from "./validation";

export type PublicProfile = {
  username: string | null;
  displayName: string | null;
  bio: string | null;
  hasAvatar: boolean;
};

type ProfileRow = {
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_storage_key: string | null;
};

function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    hasAvatar: row.avatar_storage_key !== null,
  };
}

export async function getProfileByUserId(userId: string): Promise<PublicProfile | null> {
  const result = await query<ProfileRow>(
    `
      SELECT username, display_name, bio, avatar_storage_key
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  const row = result.rows[0];
  return row ? toPublicProfile(row) : null;
}

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
  const result = await query<ProfileRow>(
    `
      SELECT username, display_name, bio, avatar_storage_key
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [username],
  );

  const row = result.rows[0];
  return row ? toPublicProfile(row) : null;
}

export async function updateProfile(
  userId: string,
  input: ValidatedProfileInput,
): Promise<PublicProfile | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  const add = (column: string, value: unknown) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if ("username" in input) add("username", input.username);
  if ("displayName" in input) add("display_name", input.displayName);
  if ("bio" in input) add("bio", input.bio);
  if ("avatarStorageKey" in input) {
    const avatarStorageKey = input.avatarStorageKey;
    if (avatarStorageKey !== null && avatarStorageKey !== undefined && !avatarStorageKey.startsWith(`avatars/${userId}/`)) {
      throw new Error("INVALID_AVATAR_REFERENCE");
    }
    add("avatar_storage_key", avatarStorageKey);
  }

  values.push(userId);
  const userParameter = `$${values.length}`;

  const result = await query<ProfileRow>(
    `
      UPDATE users
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = ${userParameter}
      RETURNING username, display_name, bio, avatar_storage_key
    `,
    values,
  );

  const row = result.rows[0];
  return row ? toPublicProfile(row) : null;
}
