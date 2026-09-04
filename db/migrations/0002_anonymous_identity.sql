ALTER TABLE users
  ADD COLUMN public_id TEXT NOT NULL DEFAULT ('u_' || encode(gen_random_bytes(18), 'base64url')),
  ADD CONSTRAINT users_public_id_format_chk
    CHECK (public_id ~ '^u_[A-Za-z0-9_-]{24}$');

CREATE UNIQUE INDEX users_public_id_unique_idx ON users(public_id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT sessions_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_device_id_idx ON sessions(device_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE INDEX devices_user_id_created_at_idx ON devices(user_id, created_at DESC);
