# Authentication boundary

This milestone supports anonymous identity only. There are no passwords, email addresses, phone numbers, or real-name fields.

Sessions use cryptographically random bearer tokens generated with Node's established `crypto.randomBytes`. Only a SHA-256 token hash is stored in PostgreSQL. Session cookies are HttpOnly and SameSite=Lax, use the `__Host-` prefix, and become Secure in production.

Anonymous account creation has a small in-process rate limit. This protects a single application instance from obvious abuse without persisting IP addresses. A multi-instance production deployment should replace this with a shared, privacy-conscious rate limiter before launch.
