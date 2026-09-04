ALTER TABLE users
  ADD COLUMN username TEXT,
  ADD COLUMN display_name TEXT,
  ADD COLUMN bio TEXT,
  ADD COLUMN avatar_storage_key TEXT;

ALTER TABLE users
  ADD CONSTRAINT users_username_format_chk
    CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  ADD CONSTRAINT users_display_name_length_chk
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 64),
  ADD CONSTRAINT users_bio_length_chk
    CHECK (bio IS NULL OR char_length(bio) <= 160),
  ADD CONSTRAINT users_avatar_storage_key_length_chk
    CHECK (avatar_storage_key IS NULL OR char_length(avatar_storage_key) BETWEEN 1 AND 512);

CREATE UNIQUE INDEX users_username_unique_idx ON users(username) WHERE username IS NOT NULL;
CREATE INDEX users_username_lookup_idx ON users(username) WHERE username IS NOT NULL;
