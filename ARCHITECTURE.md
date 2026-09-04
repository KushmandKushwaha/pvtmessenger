# Architecture

## Goals

The system is a small, maintainable, privacy-focused Internet messenger. The architecture separates persistent application data, real-time transport, media storage, and client-side encryption.

## High-level structure

```text
Web / Mobile Browser
        |
        | HTTPS
        v
Application API
        |
        +---- PostgreSQL
        |       |
        |       +-- accounts/profiles
        |       +-- conversations/memberships
        |       +-- encrypted message envelopes/metadata
        |       +-- reactions/read state
        |
        +---- Object Storage
        |       |
        |       +-- encrypted media objects
        |
        +---- WebSocket Gateway
                |
                +-- message events
                +-- typing events
                +-- presence events

Client-side crypto layer
        |
        +-- key management
        +-- encryption/decryption
        +-- device/session handling
```

## Main components

### Client
Responsible for UI, local session state, conversation state, encryption/decryption, and key management. Plaintext message content should exist only where required on the user's device.

### Application API
Responsible for authentication, authorization, conversation management, message envelopes/metadata, attachment authorization, and other application operations. It must not require plaintext message contents.

### WebSocket layer
Handles authenticated real-time events such as encrypted message delivery, typing indicators, read-state updates, and presence. WebSocket messages must be validated and authorized server-side.

### PostgreSQL
Stores structured application data and encrypted message payloads/envelopes. Large media is not stored directly in PostgreSQL.

### Object storage
Stores media attachments. Access should use authorization-controlled, short-lived mechanisms rather than public buckets.

## Core entities

- `users`
- `profiles`
- `devices` / sessions
- `conversations`
- `conversation_members`
- `messages`
- `message_reactions`
- `message_reads`
- `attachments`
- encryption/key metadata required by the selected established protocol

Exact schema should be designed during the database milestone rather than prematurely locking implementation details.

## Message flow

1. Sender composes a message locally.
2. Client encrypts the message using the selected established E2EE protocol/library.
3. Client sends an encrypted payload/envelope over HTTPS or WebSocket.
4. Server authenticates the sender and authorizes conversation membership.
5. Server persists only the encrypted message data and minimum necessary metadata.
6. Server broadcasts the encrypted event to authorized recipients.
7. Recipient clients decrypt locally.

## Media flow

1. Client prepares/encrypts media according to the selected E2EE design.
2. Client obtains an authorized upload mechanism.
3. Media is uploaded to object storage.
4. PostgreSQL stores only attachment metadata/reference information needed by the application.
5. Authorized recipients obtain the encrypted object and decrypt locally.

## Search boundary

Search is exposed through a dedicated search service so its backing implementation can change without changing the UI or message transport. While E2EE is not implemented, message search uses a bounded server-side `search_content` index. This is a temporary plaintext search representation and must not be treated as an E2EE property. After E2EE is introduced, this server-side representation should be removed/replaced by a client-side index of locally decrypted content after security review.

## Privacy model

Minimize collection and retention of:
- message contents
- unnecessary IP/device metadata
- detailed activity history
- unnecessary analytics
- unnecessary message metadata

Presence and typing information should generally be ephemeral rather than long-term records.

## Scalability

Start with a single application service, PostgreSQL, object storage, and WebSocket layer. Introduce queues, caches, or additional services only when measured requirements justify them.

## Security boundaries

The cryptographic implementation and key-management design are security-critical. Use mature, established protocols/libraries and do not invent cryptographic primitives or protocols. Production use requires professional security review.

## Attachment storage implementation

Attachments use private S3-compatible object storage. PostgreSQL stores metadata and a non-public storage key only. Storage credentials remain server-side. Objects are uploaded with provider-side AES-256 server-side encryption and private cache controls. Client-side attachment encryption is intentionally deferred until the E2EE milestone has a supported, reviewed client implementation.
