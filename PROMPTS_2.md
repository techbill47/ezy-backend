# EZY MVP - PROMPTS
How to use: paste ONE prompt at a time into the coding agent of the right project (backend prompts in ezy-backend, frontend prompts in ezy-frontend). Wait for the result and test it before the next prompt. If a result looks wrong, send me the output.
After each verified step, commit: git add -A  then  git commit -m "milestone name"

ORDER: do B8 right after B5, and F9 after F7 and before F8.
NOTE: PROMPTS F5 and F6 depend on the F1 BLE test result. If F1 shows that broadcasting does not work on your phones, use the "FALLBACK" version written under each.

==================== BACKEND ====================

## B0 - Skeleton + database
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B0: create the ezy-backend project (git init, .gitignore, .env.example, package.json with the fixed stack), an Express app listening on 0.0.0.0 with GET /health, a db connection through DATABASE_URL, db/schema.sql with ALL tables from the spec, scripts/migrate.js, and a seed of the departments only. Add a test for /health using the test database. Then stop. Tell me exactly which commands to run and what I should see.

## B1 - Auth
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B1: POST /api/auth/register, POST /api/auth/login, GET /api/me. Hash PINs with bcryptjs, issue JWTs, require COORDINATOR_CODE when role is coordinator, rate-limit login, validate with zod. Add tests: duplicate matricule, duplicate phone, wrong PIN, coordinator without the code. Then stop and report.

## B2 - Departments
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B2: GET /api/departments (public) returning the seeded departments, and make sure the seed is idempotent (running it twice creates no duplicates). Add a test. Then stop and report.

## B3 - Courses
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B3: GET /api/courses (courses of my department + year) and POST /api/courses (coordinator only; department and year come from the coordinator; duplicate code in the same department + year returns a clear error). Add tests, including a student trying to create a course. Then stop and report.

## B4 - Sessions
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B4: POST /api/sessions (coordinator only; generates a unique 6-character code from A-Z and 2-9; sets ends_at from durationMinutes; only one active session per coordinator; auto-marks the coordinator present), POST /api/sessions/:id/end, GET /api/sessions/active (for my department + year, or null; auto-end sessions whose ends_at has passed). Add tests. Then stop and report.

## B5 - Attendance sync + report
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B5: POST /api/attendance/sync exactly as in the spec (idempotent, per-item results, the time window rule, the department + year check) and GET /api/sessions/:id/report (coordinator only, ALL students of that class with present true/false). Add tests: duplicate item, wrong class, outside the time window, unknown code. Then stop and report.

## B6 - Demo seed
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B6: extend db/seed.js with the demo data from the spec (coordinator DEMO-C1, students DEMO-S01 to DEMO-S20, PIN 1234, Mechanical and Industrial Engineering year 1, 2 courses, plus 6 ended sessions across the 2 courses with varied attendance: some students about 100%, some about 50%, a few low) behind a separate command npm run seed:demo. It must be safe to run more than once. Then stop and tell me how to reset the demo.

## B7 - Neon switch + demo run notes
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B7: confirm the backend works against a Neon database by changing only DATABASE_URL (SSL options handled through the connection string). Write a short RUNNING.md with exact commands for: starting Postgres/the backend, starting ngrok with a static domain, testing from a phone browser, and the hotspot fallback using the laptop's local IP. Then stop.

## B8 - Marks conversion (do right after B5)
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone B8: GET /api/courses/:id/marks?max=10 exactly as in the spec (coordinator of that class only; max is a number from 1 to 100; totalSessions counts ended sessions only; percentage = attended / totalSessions x 100, 0 when no sessions; marks = round(percentage / 100 x max, 2); ALL students of the class, sorted by matricule). Add tests: a student with 100%, one with 50%, one with 0%, zero sessions held, invalid max, a student calling it, a coordinator of another class. Then stop and report.

==================== FRONTEND ====================

## F0 - Project + connection check
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F0: create the Flutter project ezy-frontend (git init), set the Gradle memory limit, add lib/config.dart reading API_BASE_URL, and one screen that calls GET /health and shows "Backend OK" or the error. Tell me exactly how to run it on my USB-connected Android phone with flutter run --dart-define=API_BASE_URL=... and what I should see. Then stop.

## F1 - BLE test (throwaway)
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F1, a throwaway BLE test screen: one button "Broadcast code ABC234" (flutter_ble_peripheral) and one button "Scan" (flutter_blue_plus) that shows any EZY signal found with its code, RSSI and time. Handle all permissions and add the needed AndroidManifest permissions. Try service data first, then manufacturer data, then device name, and tell me which one worked on my two phones. Then stop. Tell me exactly how to test with the two phones.

## F2 - App skeleton
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F2: app theme (white background, blue #1E5BD8), simple navigation, an API client (base URL, JSON, token header, ngrok-skip-browser-warning header, clear error messages), token + user saved with shared_preferences, and a splash screen that goes to login or home depending on the saved token. Keep the F1 BLE code in a separate screen I can remove later. Then stop.

## F3 - Register and login
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F3: login screen (matricule + PIN) and register screen (matricule, full name, phone, department dropdown from GET /api/departments, year dropdown 1-5, 4-digit PIN, role choice; coordinator code field only when role is coordinator). Validate inputs, show loading and errors, save the token, go to home. Home shows my name and role. Add a logout button. Then stop.

## F4 - Coordinator courses
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F4: for coordinators, a courses screen listing my class courses and a form to add a course (code, name). Students see a read-only list. Then stop.

## F5 - Coordinator: start session + live list
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F5: for coordinators, start a session (choose a course and a duration in minutes), call POST /api/sessions, then start BLE advertising with the returned code (use the encoding that worked in F1). Show a session screen with the code in big letters, a countdown, the list of present students (refresh button + auto refresh every 15 seconds) and an End session button that stops advertising. Then stop.
FALLBACK (if broadcasting does not work): do the same but WITHOUT BLE advertising; just show the 6-character code in very large letters.

## F6 - Student: mark attendance + offline queue
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F6: for students, a home screen with a big "Mark attendance" button. It scans up to 10 seconds for the EZY signal, reads the code, saves {sessionCode, detectedAt} in a local queue and shows "Marked". A background-free sync service sends the queue to POST /api/attendance/sync when the app opens, when connectivity returns, and with a manual "Sync now" button. Show the pending count and the result of each sync. It must work with NO internet after a prior login. Then stop.
FALLBACK (if scanning does not work): replace the scan with a text field where the student types the 6-character code, keep everything else the same.

## F7 - PDF export
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F7: after a session ends (and from a "past sessions" list for the coordinator), call GET /api/sessions/:id/report and build the PDF attendance sheet in the app (pdf + printing packages) exactly as described in the spec, with a Share/Save button. Then stop.

## F8 - Polish + release build
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F8: polish loading, error and empty states, add an offline badge, make sure nothing crashes if the backend is unreachable, set the app name to EZY, and give me the exact commands to build a release APK (flutter build apk --release --dart-define=API_BASE_URL=...) and install it on my second phone. Then stop.

## F9 - Marks conversion screen (do after F7, before F8)
Read AGENTS.md and PRODUCT-SPEC.md. Do ONLY milestone F9: for coordinators, a "Convert to marks" button on each course. It opens a screen with chips for 5, 10, 15, 20, 30 (plus a custom number field, 1-100), calls GET /api/courses/:id/marks?max=..., and shows the table (matricule, name, attended/total, %, marks) with totals. Add an "Export PDF" button that builds the Marks sheet PDF in the app exactly as in the spec, with Share/Save. Handle loading, errors, and the "no sessions held yet" case. Then stop.

==================== DEMO DAY CHECKLIST ====================
- Laptop plugged in, awake, Postgres + backend + ngrok running. Open the ngrok URL /health in a phone browser first.
- Both phones: app installed, Bluetooth ON, location ON, logged in while you still have internet.
- Phone A = coordinator (DEMO-C1). Phone B = a student account.
- Backup: demo video on the phone + the PDF from a rehearsal.
- If the hall internet fails: laptop hotspot + local IP build, or show the video.
