/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require("pg");
const { createHash } = require("crypto");

const token = process.argv[2];

if (!token) {
  console.error("Usage: node check-session.cjs <session-token>");
  process.exit(1);
}

const hash = createHash("sha256")
  .update(token, "utf8")
  .digest();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query(
  `SELECT id, user_id, device_id, expires_at
   FROM sessions
   WHERE token_hash = $1`,
  [hash]
)
.then(result => {
  console.log(result.rows);
})
.catch(console.error)
.finally(() => pool.end());