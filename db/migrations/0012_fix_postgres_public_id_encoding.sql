-- Fix PostgreSQL base64url encoding bug
-- PostgreSQL encode() does not support 'base64url' encoding name
-- Use base64 encoding with character replacements to achieve URL-safe format

-- conversations.public_id: c_<24 URL-safe chars>
ALTER TABLE conversations
  ALTER COLUMN public_id SET DEFAULT (
    'c_' || replace(replace(encode(gen_random_bytes(18), 'base64'), '+', '-'), '/', '_')
  );

-- users.public_id: u_<24 URL-safe chars>
ALTER TABLE users
  ALTER COLUMN public_id SET DEFAULT (
    'u_' || replace(replace(encode(gen_random_bytes(18), 'base64'), '+', '-'), '/', '_')
  );

-- attachments.public_id: a_<24 URL-safe chars>
ALTER TABLE attachments
  ALTER COLUMN public_id SET DEFAULT (
    'a_' || replace(replace(encode(gen_random_bytes(18), 'base64'), '+', '-'), '/', '_')
  );