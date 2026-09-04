ALTER TABLE messages
  ADD COLUMN parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN forwarded_from_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX messages_parent_message_idx
  ON messages(parent_message_id)
  WHERE parent_message_id IS NOT NULL;

CREATE INDEX messages_forwarded_from_idx
  ON messages(forwarded_from_message_id)
  WHERE forwarded_from_message_id IS NOT NULL;

CREATE INDEX messages_sender_created_idx
  ON messages(sender_device_id, created_at DESC);

CREATE TABLE message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, reaction),
  CONSTRAINT message_reactions_value_chk CHECK (char_length(reaction) BETWEEN 1 AND 32)
);

CREATE INDEX message_reactions_message_idx
  ON message_reactions(message_id, created_at ASC);

CREATE INDEX message_reactions_user_idx
  ON message_reactions(user_id, created_at DESC);
