# AGENTS.md - ezy-backend

Read PRODUCT-SPEC.md first. It is the source of truth. If anything conflicts, stop and ask.

## Goal
Smallest working backend for the EZY attendance demo on Tuesday 27 Oct 2026. No extras.

## Stack (fixed - do not change)
- Node 20+, Express, plain JavaScript (ES modules, NO TypeScript)
- PostgreSQL via `pg` (no ORM)
- bcryptjs (PIN hashing), jsonwebtoken, zod, cors, dotenv, express-rate-limit
- Tests: node:test with built-in fetch against TEST_DATABASE_URL (never the dev database)
- Config only via .env: DATABASE_URL, TEST_DATABASE_URL, JWT_SECRET, COORDINATOR_CODE, PORT

## Layout
src/index.js, src/app.js, src/config.js, src/db.js, src/routes/*.js, src/middleware/*.js,
db/schema.sql, db/seed.js, scripts/migrate.js, test/*.test.js

## Rules
1. One milestone per task. Do only what the task says, then stop and report.
2. No features outside PRODUCT-SPEC.md. No wallet, no payments, no notifications.
3. Validate every input with zod. Errors are JSON: {error: "message"}.
4. Never log or return PINs, PIN hashes or tokens.
5. Uniqueness is enforced by DB constraints, not only by code.
6. Attendance sync is idempotent: the same student and session twice = one row, no error.
7. Keep it light: no heavy libraries, no background jobs. The laptop is slow.
8. The server listens on 0.0.0.0 so ngrok and phones can reach it.
9. Follow the API contract exactly. Do not invent endpoints or rename fields.
10. After each task: run npm test, report pass/fail honestly, list the files changed.
11. Git: run git init at B0. After each verified task, give Tontu the commit commands (git add -A, then git commit -m "message"). Never push or force anything.
12. If something is unclear or risky, ask before coding.

## Commands
npm run dev | npm run migrate | npm run seed | npm test
