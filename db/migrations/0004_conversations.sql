ALTER TABLE conversations
  ADD COLUMN public_id TEXT NOT NULL DEFAULT ('c_' || encode(gen_random_bytes(18), 'base64url')),
  ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_public_id_format_chk
    CHECK (public_id ~ '^c_[A-Za-z0-9_-]{24}$');

CREATE UNIQUE INDEX conversations_public_id_unique_idx ON conversations(public_id);
CREATE INDEX conversations_created_by_idx ON conversations(created_by);

ALTER TABLE conversation_members
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member',
  ADD CONSTRAINT conversation_members_role_chk
    CHECK (role IN ('owner', 'admin', 'member'));

CREATE INDEX conversation_members_conversation_role_idx
  ON conversation_members(conversation_id, role);
