# AGENTS.md - ezy-frontend
(Copy this file into the ezy-frontend folder and name it AGENTS.md)

Read PRODUCT-SPEC.md first. It is the source of truth. If anything conflicts, stop and ask.

## Goal
Smallest working Android app for the EZY attendance demo on Tuesday 27 Oct 2026. No extras.

## Stack (fixed)
- Flutter (stable), Dart. Android only.
- Packages: http, provider, shared_preferences (token + offline queue), flutter_blue_plus (scan), flutter_ble_peripheral (advertise), permission_handler, connectivity_plus, pdf, printing, intl
- No emulator. Tontu tests on a real Android phone over USB (flutter run).
- API base URL comes from lib/config.dart (--dart-define=API_BASE_URL=...). Every request sends the header ngrok-skip-browser-warning: true.

## Layout
lib/main.dart, lib/config.dart, lib/api/*.dart, lib/models/*.dart, lib/screens/*.dart,
lib/services/ble_service.dart, lib/services/queue_service.dart, lib/services/pdf_service.dart, lib/widgets/*.dart

## Rules
1. One milestone per task. Do only what the task says, then stop and report.
2. No features outside PRODUCT-SPEC.md. Follow the UI rules in the spec.
3. Marking attendance must work with NO internet: queue locally, sync later.
4. Handle Android 12+ Bluetooth permissions (BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT) and location for older Android versions. Ask at the moment of use with a clear message.
5. Always show loading, error and empty states. No silent failures.
6. Keep the laptop light: set org.gradle.jvmargs=-Xmx1536M in android/gradle.properties. Do not add heavy dependencies.
7. Verify with flutter analyze after each task and report honestly. Tell Tontu exactly how to run it and what to check on the phone.
8. Git: run git init at F0. After each verified task, give Tontu the commit commands (git add -A, then git commit -m "message"). Never push or force anything.
9. Do not guess BLE behavior. If a plugin API is unclear, read its docs or source and say what you found.
10. If something is unclear or risky, ask before coding.
