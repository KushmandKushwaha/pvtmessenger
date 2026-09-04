ALTER TABLE conversations
  ADD COLUMN message_sequence BIGINT NOT NULL DEFAULT 0;

ALTER TABLE messages
  ADD COLUMN sequence BIGINT,
  ADD CONSTRAINT messages_ciphertext_size_chk CHECK (octet_length(ciphertext) BETWEEN 1 AND 65536);

UPDATE messages m
SET sequence = s.sequence
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at, id)::BIGINT AS sequence
  FROM messages
) s
WHERE m.id = s.id;

ALTER TABLE messages
  ALTER COLUMN sequence SET NOT NULL;

UPDATE conversations c
SET message_sequence = COALESCE((SELECT MAX(m.sequence) FROM messages m WHERE m.conversation_id = c.id), 0);

CREATE UNIQUE INDEX messages_conversation_sequence_unique_idx
  ON messages(conversation_id, sequence);

CREATE TABLE message_deliveries (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, device_id),
  CONSTRAINT message_deliveries_status_timestamp_chk
    CHECK ((status = 'pending' AND delivered_at IS NULL) OR (status = 'delivered' AND delivered_at IS NOT NULL))
);

CREATE INDEX message_deliveries_device_status_idx
  ON message_deliveries(device_id, status, created_at);

CREATE INDEX message_deliveries_message_idx
  ON message_deliveries(message_id);

CREATE INDEX messages_conversation_sequence_idx
  ON messages(conversation_id, sequence ASC);

CREATE INDEX messages_created_at_idx
  ON messages(created_at DESC);
