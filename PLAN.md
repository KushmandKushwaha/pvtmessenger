# Messaging App Implementation Plan

## Milestone 1 — Project foundation
- Set up the web application and development tooling.
- Establish environment-variable handling.
- Add basic health checks and a minimal application shell.
- Test: application starts locally and the health check succeeds.

## Milestone 2 — Database and core data model
- Configure PostgreSQL.
- Define users, profiles, conversations, memberships, messages, reactions, read states, and attachment metadata.
- Add migrations and indexes.
- Test: migrations apply cleanly and basic CRUD works.

## Milestone 3 — Authentication and identity
- Implement secure authentication with established libraries/providers.
- Support optional anonymous accounts and optional recovery/authentication.
- Add username/profile management.
- Test: signup/login/recovery flows and authorization boundaries.

## Milestone 4 — Conversation management
- Implement 1-to-1 and group conversation creation.
- Add membership and permission rules.
- Test: users can only access conversations they belong to.

## Milestone 5 — End-to-end encryption foundation
- Select a mature, reviewed cryptographic protocol/library suitable for the application's requirements.
- Design client-side key generation, storage, rotation, device handling, and recovery boundaries.
- Keep plaintext message contents out of server storage.
- Test: encrypted message flow works without the server receiving plaintext.
- Production gate: professional security review required before relying on the system for sensitive communication.

## Milestone 6 — Real-time transport
- Add WebSocket-based message/event delivery.
- Implement connection authentication, authorization, reconnection, and event validation.
- Test: messages and presence-related events update across multiple clients.

## Milestone 7 — Messaging features
- Add sending, editing, deletion, replies, reactions, read receipts, and message pagination.
- Test each feature independently with multiple users/devices.

## Milestone 8 — Presence and typing
- Add online/offline presence and typing indicators using ephemeral real-time state.
- Minimize persistent metadata.
- Test disconnect/reconnect behavior and privacy defaults.

## Milestone 9 — Attachments and object storage
- Add image/file uploads using object storage rather than PostgreSQL blobs.
- Use authenticated upload/download flows, size/type limits, and metadata minimization.
- Test upload, encrypted-content handling where applicable, access control, and deletion.

## Milestone 10 — Responsive application UI
- Build the desktop/mobile conversation experience.
- Add profiles, conversation list, composer, message states, attachments, reactions, and accessibility states.
- Test responsive layouts and keyboard/touch interaction.

## Milestone 11 — Privacy and security hardening
- Review authentication, authorization, encryption/key handling, WebSocket validation, storage access, rate limits, logging, error handling, and dependency security.
- Remove unnecessary telemetry and sensitive logs.
- Test abuse/rate-limit cases and common security failure modes.
- Production gate: professional security review of cryptography, key management, authentication, and server architecture.

## Milestone 12 — Production readiness
- Configure deployment, PostgreSQL backups, object-storage lifecycle rules, monitoring with privacy-preserving logs, migrations, and incident procedures.
- Run end-to-end tests and a final security checklist.
- Test failure/recovery scenarios before release.

## Milestone 10A — Search
- Add a clean search service boundary for users, conversations, and messages.
- Enforce server-side authorization for message/conversation search.
- Use bounded, indexed database search while E2EE is not implemented.
- Keep the boundary replaceable with a local decrypted search index after E2EE.
- Test validation, pagination, authorization, abuse controls, and performance.
