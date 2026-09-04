# Security Requirements

## Security principles

- Use established, mature cryptographic protocols and libraries.
- Never invent cryptographic algorithms.
- Do not implement custom cryptography when a reviewed library/protocol is available.
- Never store plaintext passwords.
- Do not store plaintext message contents on the server.
- Do not put large media files directly in PostgreSQL.
- Use secure defaults and least-privilege access.
- Minimize collected and retained metadata.

## Authentication

- Password authentication, if used, must use a mature password-hashing/KDF implementation.
- Never log passwords, tokens, recovery secrets, or encryption keys.
- Sessions must be protected against fixation, theft, and unintended persistence.
- Recovery must be designed so that it does not silently weaken the E2EE security model.

## End-to-end encryption

E2EE is a security-critical subsystem.

The implementation must select an established, independently reviewed protocol/library appropriate for:
- 1-to-1 conversations
- group conversations
- multiple devices
- key changes and rotation
- offline delivery
- attachment encryption
- recovery behavior

The eventual E2EE server path should handle encrypted envelopes and routing metadata, not plaintext message contents.

Current temporary exception: E2EE has not yet been implemented, so the search milestone adds a bounded `search_content` field solely to support server-side search. This is plaintext at rest and must not be represented as E2EE. It should be removed/replaced by a client-side decrypted search index when the E2EE milestone is completed.

Do not invent a new encryption protocol or combine primitives into a custom protocol without expert review.

**Production requirement:** cryptographic protocol selection, implementation, key management, recovery, multi-device behavior, and attachment encryption must receive professional security review before the application is presented as secure/private for real users.

## Authorization

Every conversation, message, attachment, and membership operation must verify authorization server-side.

Never rely on client-side checks for access control.

## WebSockets

- Authenticate connections.
- Authorize every event/action.
- Validate message schemas and sizes.
- Rate-limit abusive behavior.
- Handle reconnects safely.
- Avoid leaking conversation data through broadcast mistakes.

## Attachments

- Use private object-storage buckets.
- Restrict upload size and accepted types.
- Generate non-guessable object identifiers.
- Enforce authorization on access.
- Do not trust client-supplied MIME types or filenames.
- Avoid serving user-uploaded content in a way that creates script execution risks.
- Encrypt attachment contents client-side when required by the selected E2EE design.

## Database

- Use parameterized queries/ORM protections.
- Apply least-privilege database credentials.
- Encrypt storage and backups using the deployment provider's established mechanisms.
- Keep secrets outside source control.
- Add appropriate indexes without collecting unnecessary metadata.

## Privacy

- No unnecessary analytics or tracking by default.
- Keep logs free of message contents and secrets.
- Minimize retention of IP addresses and other metadata.
- Define retention/deletion behavior explicitly.
- Document what information the server can technically observe.

## Abuse and availability

- Add rate limits for authentication, messaging, uploads, and expensive operations.
- Validate input lengths and payload sizes.
- Prevent resource exhaustion.
- Add abuse reporting/moderation mechanisms only to the extent compatible with the privacy model.

## Secrets

Use environment/secret-management facilities for:
- database credentials
- object-storage credentials
- authentication secrets
- WebSocket signing/session secrets
- deployment credentials

Never commit secrets to Git.

## Security testing

Before production:
- dependency/security scanning
- authentication and authorization tests
- WebSocket abuse tests
- attachment access-control tests
- injection/input-validation tests
- session/security-token tests
- E2EE/key-management tests
- backup/restore tests
- privacy/logging review
- professional security review of cryptography and key management

## Threat-model checkpoint

Before implementing E2EE, explicitly document:
- what the server can see
- what a compromised server can see
- what happens if a device is lost
- what happens when a new device is added
- what recovery can and cannot restore
- group membership/key-change behavior
- attachment confidentiality
- metadata that remains visible despite E2EE

Security claims should be limited to properties that are actually implemented and independently reviewed.

## Attachment implementation status

The current attachment milestone uses private object storage with provider-side AES-256 server-side encryption. This protects stored objects at rest but is **not end-to-end encryption**. Client-side encryption remains deferred because the E2EE protocol/client integration has not yet been safely selected and implemented. Attachment authorization is enforced server-side through conversation membership; deletion additionally requires the authenticated user to own the sending device for the message.

## Security review status

A security review was performed after the Search milestone. Fixes include strict same-origin checks on cookie-authenticated state-changing API requests, production-only `__Host-` secure session cookies with an HTTP-compatible development cookie, security response headers, authenticated API mutation rate limits, strict WebSocket Origin validation, WebSocket per-user/device connection caps, and a generic WebSocket event rate limit.

Known limitations that are not safely solvable by a local code patch:

- E2EE is not implemented. The temporary server-side `search_content` field is plaintext at rest and must be removed after a reviewed client-side E2EE search design exists.
- Anonymous accounts have no recovery mechanism. Loss of the session token means loss of access; adding recovery without a reviewed identity/key-recovery design could weaken future E2EE.
- Device/session management is currently limited to the authenticated session/logout model; a complete device revocation UI is not present.
- In-memory rate limiting is per process. A multi-instance production deployment needs a shared rate-limit store or an equivalent edge/API-gateway control.
- Dependency vulnerability status could not be verified in this environment because the npm registry was unreachable and no lockfile is present. A lockfile and `npm audit`/automated dependency scanning must be run in CI before production.
- PostgreSQL least privilege is a deployment responsibility and is documented in `db/README.md`; migrations should use a separate DDL-capable role.
- Cryptography, key management, recovery, multi-device E2EE, and encrypted attachments require professional security review before production use.
