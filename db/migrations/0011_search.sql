CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Temporary server-side search index while E2EE is not implemented.
-- This column is intentionally isolated so it can be removed/replaced by a client-side
-- decrypted search index when E2EE arrives.
ALTER TABLE messages
  ADD COLUMN search_content TEXT,
  ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(search_content, ''))
  ) STORED,
  ADD CONSTRAINT messages_search_content_length_chk
    CHECK (search_content IS NULL OR char_length(search_content) <= 65536);

CREATE INDEX users_username_trgm_idx
  ON users USING GIN (username gin_trgm_ops)
  WHERE username IS NOT NULL;

CREATE INDEX users_display_name_trgm_idx
  ON users USING GIN (display_name gin_trgm_ops)
  WHERE display_name IS NOT NULL;

CREATE INDEX conversations_name_trgm_idx
  ON conversations USING GIN (name gin_trgm_ops)
  WHERE name IS NOT NULL;

CREATE INDEX messages_search_vector_idx
  ON messages USING GIN (search_vector)
  WHERE search_content IS NOT NULL;

CREATE INDEX messages_conversation_created_id_idx
  ON messages (conversation_id, created_at DESC, id DESC);

CREATE INDEX messages_sender_device_created_id_idx
  ON messages (sender_device_id, created_at DESC, id DESC);
