# EZY MVP - PRODUCT SPEC (source of truth)

Deadline: demo on Tuesday 27 Oct 2026, 10:00, UBa Auditorium (10 min presentation + 5-10 min Q&A).
Goal: a tiny, WORKING attendance app. Nothing extra.
Put an identical copy of this file in BOTH ezy-backend and ezy-frontend.

## IN SCOPE
1. Register / login: matricule + full name + phone + 4-digit PIN + department + year.
2. Two roles: student and coordinator. Coordinator registration needs COORDINATOR_CODE.
3. A coordinator creates courses for HIS OWN department + year.
4. A coordinator starts a session (course + duration). His phone broadcasts a BLE signal carrying a short session code.
5. A student taps "Mark attendance"; the phone scans for the signal and records presence.
6. Works OFFLINE: detections are queued on the phone and synced when internet returns.
7. The coordinator sees who is present and exports a PDF attendance sheet (built inside the app).
8. Attendance-to-marks conversion: for a course, the coordinator picks a maximum (5, 10, 15, 20 or 30; custom allowed 1-100) and the app converts every student's attendance percentage into marks out of that maximum, shows a table and exports it as a PDF. (In this MVP the coordinator is the only privileged user, so he performs the conversion; a separate lecturer role comes later.)

## OUT OF SCOPE (do NOT build)
Wallet, payments, notifications, Note Hub, analytics, risk alerts, biometrics, lecturer role, multiple coordinators, manual corrections, iOS, password reset, admin panel, AI features.

## ENVIRONMENT
- Dev: local PostgreSQL with two databases: ezy_dev and ezy_test.
- Demo: backend runs on Tontu's laptop, made public with an ngrok STATIC domain. The app sends the header ngrok-skip-browser-warning: true.
- Fallback 1: laptop hotspot / phone hotspot, app pointed at the laptop's local IP.
- Fallback 2: Neon online database (only DATABASE_URL changes).
- Last resort: pre-recorded demo video.

## DATA MODEL (PostgreSQL)
- departments(id serial pk, code text unique, name text)
- users(id uuid pk, matricule text unique, full_name text, phone text unique, pin_hash text, role text check in ('student','coordinator'), department_id int fk, year int check 1..5, created_at timestamptz)
- courses(id uuid pk, code text, name text, department_id int fk, year int, created_by uuid fk, unique(code, department_id, year))
- sessions(id uuid pk, course_id uuid fk, started_by uuid fk, code text, started_at timestamptz, ends_at timestamptz, status text check in ('active','ended')) - code is 6 characters from A-Z and 2-9 (no I, O, 0, 1), unique among active sessions
- attendance(id uuid pk, session_id uuid fk, student_id uuid fk, detected_at timestamptz, synced_at timestamptz default now(), unique(session_id, student_id))

Seed departments:
Chemical and Biological Engineering; Civil Engineering and Architecture; Computer Engineering; Electrical and Electronics Engineering; Mechanical and Industrial Engineering; Mining and Mineral Engineering; Petroleum Engineering.
Years: 1 to 5.

## API CONTRACT (JSON, prefix /api; Bearer JWT required except health, register, login, departments)
- GET  /health -> {ok:true, time}
- GET  /api/departments -> [{id, code, name}]
- POST /api/auth/register {matricule, fullName, phone, pin, departmentId, year, role, coordinatorCode?} -> {token, user}
- POST /api/auth/login {matricule, pin} -> {token, user}
- GET  /api/me -> user
- GET  /api/courses -> courses of my department + year
- POST /api/courses {code, name} (coordinator only) -> course (department + year taken from the coordinator)
- POST /api/sessions {courseId, durationMinutes} (coordinator only) -> session (includes code). Also marks the coordinator present.
- POST /api/sessions/:id/end (only the coordinator who started it)
- GET  /api/sessions/active -> the active session for my department + year, or null
- GET  /api/sessions/:id/report (coordinator only) -> {course, session, students:[{matricule, fullName, present, markedAt}]} - ALL students of that department + year, present or not
- POST /api/attendance/sync {items:[{sessionCode, detectedAt}]} -> {results:[{sessionCode, status:'ok'|'duplicate'|'rejected', reason?}]}
- GET  /api/courses/:id/marks?max=10 (coordinator of that course's class only) -> {course, max, totalSessions, students:[{matricule, fullName, attended, percentage, marks}]}
  Rules: totalSessions = sessions of that course that have ended (or whose ends_at has passed); attended = that student's attendance rows in those sessions; percentage = attended / totalSessions x 100 (0 when totalSessions is 0); marks = round(percentage / 100 x max, 2); include ALL students of the course's department + year, sorted by matricule; max must be a number from 1 to 100.

Sync rules:
- Find the session by code.
- The student's department + year must match the course.
- detectedAt must be within [started_at - 5 min, ends_at + 5 min].
- A duplicate is not an error (status 'duplicate').

Errors: {error: "message"} with proper HTTP status codes.

## BLE SPEC
- The coordinator phone advertises one constant EZY service UUID (defined once as a constant in the app) with the 6-character session code as payload. Preferred encoding: service data. Fallbacks, in order: manufacturer data, device name.
- The student phone scans for that UUID for up to 10 seconds, reads the code, stores {sessionCode, detectedAt} locally and shows "Marked".
- No pairing, no connection. App must be open (foreground only).
- If BLE advertising fails on the test phones, the fallback is: the coordinator screen shows the 6-character code and the student types it in.

## OFFLINE RULES
- The login token is saved on the phone. After one online login, a student can mark attendance with no internet.
- The queue is stored locally and synced on app open and when the connection returns.
- Show a pending-sync count.

## PDF (built inside the app)
Title "EZY Attendance Sheet", course code + name, department + year, session date and time, a table (No., Matricule, Full name, Present/Absent) and totals. Shareable from the phone.

Marks sheet PDF (built inside the app from GET /api/courses/:id/marks): Title "EZY Attendance Marks Sheet", course code + name, department + year, the maximum chosen, total sessions held, table (No., Matricule, Full name, Attended/Total, %, Marks /max). Shareable from the phone.

## UI RULES
White background, blue (#1E5BD8) accents, big buttons, English, simple lists, no animations. Always show loading, error and empty states.

## DEMO DATA (seed)
- 1 coordinator: matricule DEMO-C1, PIN 1234
- about 20 students: DEMO-S01 to DEMO-S20, PIN 1234, all in Mechanical and Industrial Engineering, year 1
- 2 courses for that class
- 6 ended sessions across the 2 courses with varied attendance (some students about 100%, some about 50%, a few low) so the marks conversion looks real

## NON-NEGOTIABLE
- Never store raw PINs.
- Sync must be idempotent.
- Marking attendance must work offline.
- Do not build anything out of scope.
