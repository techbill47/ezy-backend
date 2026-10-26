# EZY backend B0

Open a new PowerShell window after changing user PATH or environment variables.

In PowerShell, use `npm.cmd` because this machine's execution policy blocks `npm.ps1`.

## Commands

- `npm.cmd install` installs the fixed backend dependencies.
- `npm.cmd run migrate` applies `db/schema.sql`; it is safe to run repeatedly.
- `npm.cmd run seed` inserts or updates the seven departments without duplicates.
- `npm.cmd test` verifies `/health` and confirms the configured test database is reachable. Tests refuse to run unless `TEST_DATABASE_URL` contains `test` and differs from `DATABASE_URL`.
- `npm.cmd run dev` starts the server on `0.0.0.0:3000` (or `PORT`).

## Test `/health` from a phone

Connect the phone and laptop to the same WiFi. In PowerShell, run `ipconfig` and find the IPv4 address under the active WiFi adapter. Start the backend, then open `http://<laptop-ip>:3000/health` in the phone browser. The response should contain `{"ok":true,"time":"..."}`.

If Windows Firewall blocks the request, open Windows Security > Firewall & network protection > Advanced settings > Inbound Rules > New Rule. Choose Port, TCP, specific local port `3000`, Allow the connection, select the active network profile, and give the rule a name such as `EZY backend 3000`.
