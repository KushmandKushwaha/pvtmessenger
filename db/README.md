# Database security

The application runtime must use a dedicated PostgreSQL role with only the privileges required by the application schema. Do not run the application with the PostgreSQL superuser (`postgres`) in production.

Recommended deployment pattern:

1. Create a dedicated database role owned by the deployment administrator.
2. Grant `CONNECT` on the database and `USAGE` on the application schema.
3. Grant only the required `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privileges on application tables/sequences.
4. Run schema migrations with a separate migration role that has DDL privileges; do not give those privileges to the long-running application role.
5. Rotate the application role password through the deployment secret manager.
6. Restrict database network access to the application service and require TLS where supported.

Example role setup should be adapted to the deployment provider rather than copied blindly. The application does not attempt to grant/revoke its own privileges because doing so safely requires an administrator-owned connection.
