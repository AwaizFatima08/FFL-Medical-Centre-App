# FFL Medical Centre — Command Board

Quick reference for daily work. For locked flow status, architecture, and decisions, see FFL_Medical_Centre_Master_Design.md instead — this file does not duplicate that content. For the full pre-production audit findings, see docs/DAY10_AUDIT_FINDINGS.md.

---

## Quick Paths
- NAS project: /mnt/storage/projects/ffl-medical-centre/
- Frontend: app/src/  |  Backend: functions/src/
- GitHub: AwaizFatima08/FFL-Medical-Centre-App (private)
- Firebase project: ffl-medical-centre-app
- Web app: https://ffl-medical-centre-app.web.app
- Dev server: 192.168.100.122:8081 (Expo) | VS Code: 192.168.100.122:8080

## Daily Commands

**Start dev server:**
cd /mnt/storage/projects/ffl-medical-centre/app
npx expo start

**Deploy web:**
cd /mnt/storage/projects/ffl-medical-centre/app
rm -rf dist
npx expo export --platform web
cd /mnt/storage/projects/ffl-medical-centre
firebase deploy --only hosting

**Deploy functions (targeted):**
cd /mnt/storage/projects/ffl-medical-centre/functions
firebase deploy --only functions:FUNCTION_NAME

**Deploy Firestore rules:**
cd /mnt/storage/projects/ffl-medical-centre
firebase deploy --only firestore:rules
*(Easy to forget — a rules change with no matching deploy silently blocks reads/writes to that collection. Lesson from Aug 29: Health Tips feature initially failed end-to-end with "Failed to load/add" errors purely because rules were written but never deployed.)*

**Build Android APK (EAS):**
cd /mnt/storage/projects/ffl-medical-centre/app
npx eas build --platform android --profile preview
*(Always confirm `git status` is clean and `git pull` is up to date before building.)*

**Check which commit a build was made from:**
cd /mnt/storage/projects/ffl-medical-centre/app
npx eas build:list --platform android --limit 5
*(Cross-reference the "Commit" field against `git log -1` before trusting a finding tested on an installed APK.)*

**Backup (end of session):**
bash /mnt/storage/projects/ffl-medical-centre/scripts/backup.sh "Day N: description"
*(Handles git commit+push, local snapshot, and Drive sync in one step. Trigger phrase: "lets backup and close".)*

## Session Log
(Newest first)

- **Aug 29, 2026 (major feature day — employee UX overhaul + auth flow hardening):**
  - **Employee home screen redesign:** replaced the 12-tile overflow grid with a side panel navigation — animated slide-in drawer on mobile (hamburger toggle), permanent fixed sidebar on web. New dashboard: time-aware greeting (pulled from `employees.fullName` via `userId`, not Firebase Auth `displayName` — that field was never populated), live date/time, health tip of the day, medical centre emergency numbers (Reception 5935, Medical Emergency 5555). Inactive tiles (Vaccination, Lab Updates, Pharmacy Updates) sort to bottom on both platforms.
  - **Custom health graphic:** AI-generated artwork (caduceus + empathy/care icons) had baked-in checkerboard "transparency" and a third-party watermark from an online background-remover tool — both required custom Python image processing (grid-position-based checker detection + border/island flood-fill) to produce a genuinely clean transparent PNG. Displayed as an inline image below the emergency card (not a background watermark — reversed an earlier design choice after real-device testing showed positioning issues).
  - **Logout icon bug (all roles, mobile only):** `⏻` Unicode power symbol isn't in Android's default font — rendered as a placeholder box. Fixed by dropping the icon entirely (text-only "Logout" — zero font-dependency risk going forward). Also fixed an invalid `fontWeight: '1200'` found in the same component.
  - **Health Tips feature (new):** `healthTips` Firestore collection, `HealthTipsAdminScreen.js` (admin_incharge only — add/delete/toggle tips, any language or mix of languages, no forced English/Urdu split), employee dashboard now fetches active tips and rotates one per day with a local hardcoded fallback if Firestore is empty or unreachable. Required a rules deploy that was initially missed — see Daily Commands note above.
  - **Admin Home grid:** 9→10 tiles, changed 3-column/140px to 4-column/108px layout to keep everything on one screen without scrolling; incidentally this also resolved the still-open Day 10 finding #5 (tile overflow) for admin_incharge.
  - **Login screen (item 4, finally closed):** root cause was a single oversized `creditLogo` style (1000×100) reused for two differently-sized logos. Rebuilt with correctly-sized separate styles; added a "Remember Me" checkbox that persists only the **email** (not password — a real device-storage security risk was flagged and avoided) via AsyncStorage. Web got a further redesign per Homi's request: fixed-width left credentials panel (HomiLabs branding, managed-by names, tagline) + narrower centered sign-in card on the right; mobile stays single-column.
  - **Signup date picker (web) — broken, now fixed:** `@react-native-community/datetimepicker` has no real web implementation; tapping the field did nothing on web (silent no-op). Fixed by branching to a native HTML `<input type="date">` on web only, mobile untouched. Same shared `DatePickerField.js` component is used across other screens (Family, Fitness, etc.) — same fix applies everywhere.
  - **Signup DOB timezone bug:** `dob.toISOString()` converts to UTC before formatting, which can shift the saved date back a day for users in PKT (UTC+5). Fixed to build the date string from local date parts directly — same pattern already used elsewhere in the codebase per prior Key Learnings.
  - **Manage Users feature (new, found via live A–Z signup testing):** Pending Approvals only ever showed *never-approved* signups — once approved, a user vanished from admin's view entirely with no way to review, disable, or reassign their role. Fixed with a new `approvedAt` field distinguishing "never approved" (Pending Approvals territory) from "approved, possibly later disabled" (new Manage Users screen territory) — critical because the existing Reject button **permanently deletes the Firebase Auth account**, and without this distinction, disabling an approved user would have made them reappear in Pending Approvals and risk accidental permanent deletion. New backend routes: `/all-users`, `/disable-user`, `/enable-user`, `/change-role`, each guarded to only operate on correctly-staged users. Verified end-to-end including a full disable→enable round-trip confirming no leakage back into Pending Approvals.
  - **Legal:** Red Crescent emblem use in the app's custom graphic flagged as a protected-symbol/Geneva Conventions concern (not a generic medical icon, despite common misuse elsewhere). Homi reviewed and made an informed decision to proceed as-is; not registering the logo, treats it as accepted practice in Pakistan medical signage. Logged here for the record, not revisited further per his direction.
  - **Design-lock items closed by decision, not code:** driver's header-bar style accepted as an intentional one-off (different navigation structure, not a tile grid — nothing to unify). Employee pink tiles vs. white elsewhere: left as-is — Homi's explicit rationale is that employees are the actual end customer and get disproportionate design investment; other roles are internal and lower priority for cosmetic parity.

- **Aug 27, 2026 (item 3 root cause found & fixed):** Investigated finding #3 (spurious error dialogs). Real cause: Google Cloud billing had been disabled since ~Aug 18, causing every backend call to fail unconditionally. Fixed by re-linking billing + redeploying `auth` function. Confirmed resolved on web and mobile.
- **Aug 27, 2026 (code-fix phase start):** Discovered Day 10 audit had been conducted against a stale APK. Findings #1 and #2 were already resolved in code — no fixes needed. NAS IP corrected (192.168.100.122).
- Day 10 (audit close-out): Full pre-production audit complete. 8 consolidated findings documented in docs/DAY10_AUDIT_FINDINGS.md.
- Day 10: Repo cleanup — protected serviceAccountKey.json, removed stray backups, created docs/ and scripts/.

## Open Items

**All original Day 10 audit findings — CLOSED:**
- [x] Vaccination flow mismatch — resolved
- [x] Blood Donor Directory + Reports tiles missing — resolved
- [x] Spurious error dialogs — resolved (billing outage)
- [x] Login screen scrolling — resolved Aug 29 (logo sizing + Remember Me + web two-column redesign)
- [x] Mobile home tile/icon/logout alignment — resolved (employee side-panel redesign; admin 4-column grid)

**Design decisions — CLOSED by explicit decision:**
- [x] Header/logout layout — driver accepted as an intentional one-off, no unification needed
- [x] Employee pink tiles vs. white — kept as-is; not revisited, per Homi's stated priority (employee = actual customer, gets the design investment; other roles stay functional/internal)

**New items found + closed during Aug 29 live testing:**
- [x] Broken logout icon (all roles, mobile)
- [x] Signup date picker non-functional on web
- [x] Signup DOB timezone-shift bug
- [x] No way to review/disable/reassign already-approved users — built Manage Users feature

**Fast-follow backlog (logged, not yet started):**
- None currently — Health Tips and Manage Users, both originally logged as fast-follow candidates, were pulled into this session and completed.

**Process (per audit methodology):**
1–9. ~~All done~~ — audit, findings, fixes, design-lock decisions, all closed as of Aug 29.
10. **Production build + Play Store submission — next major milestone.** Homi is continuing live A–Z flow testing (signup → approval → role-based screens) before locking further and moving toward submission; more findings may surface from that review and will be logged here as they're found.

**Other pending (unchanged from before):**
- Notification debugging — deferred to final pre-production testing round
- Family module — not yet built (V1 scope)
- Report frontend screens — backend done (7 endpoints), frontend screens pending