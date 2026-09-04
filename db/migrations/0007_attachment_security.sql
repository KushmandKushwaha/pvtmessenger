ALTER TABLE attachments
  ADD COLUMN public_id TEXT NOT NULL DEFAULT ('a_' || encode(gen_random_bytes(18), 'base64url')),
  ADD COLUMN original_filename TEXT NOT NULL DEFAULT 'attachment',
  ADD CONSTRAINT attachments_public_id_format_chk
    CHECK (public_id ~ '^a_[A-Za-z0-9_-]{24}$'),
  ADD CONSTRAINT attachments_original_filename_length_chk
    CHECK (char_length(original_filename) BETWEEN 1 AND 255);

CREATE UNIQUE INDEX attachments_public_id_unique_idx ON attachments(public_id);
CREATE INDEX attachments_message_created_at_idx ON attachments(message_id, created_at DESC);
