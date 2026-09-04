ALTER TABLE conversations
  ADD COLUMN name TEXT,
  ADD CONSTRAINT conversations_name_length_chk
    CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 80);

CREATE INDEX conversations_kind_updated_at_idx ON conversations(kind, updated_at DESC);
