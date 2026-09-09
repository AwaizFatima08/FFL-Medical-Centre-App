# FFL Medical Centre — Command Board

Quick reference for daily work. For locked flow status, architecture, and decisions, see FFL_Medical_Centre_Master_Design.md instead — this file does not duplicate that content. For the full pre-production audit findings, see docs/DAY10_AUDIT_FINDINGS.md. For the full Phase 4 (My Profile) design — every decision, field ownership rule, and state machine — see docs/PHASE4_DESIGN.md; this file only summarizes what shipped.

**Note on this revision (Day 14):** Phases 3 and 4 are now closed. Phase 4 in particular grew far beyond its original 5-step scope during live testing — a second round of fixes (7 issues) and a third round found during final review (3 more, including a real security bug) were folded in before closing it. See the Phase 4 entry below for the full shape of what actually shipped versus what was originally planned.

**Note on this revision (Day 15):** Phase 5 (Ambulance) grew the same way Phase 4 did — started as a gap/bug audit, ended as a near-total redesign after live testing surfaced real bugs and a full design discussion reshaped the operational model. Design is locked in `docs/PHASE5_DESIGN.md`, build sequence is broken into subphases 5.1–5.8 below. Locked but flexible — on-the-go improvements can be incorporated as build progresses; pending open items are deferred to time of need, not blocking the sequence.

**Note on this revision (Day 21):** Phase 5 is now closed — all subphases 5.1–5.9 (including 5.8's three sub-parts) built and live-verified across reception, Doctor, and CMO logins. 5.7 was deliberately decided not to be built, not missed — see the Phase 5 entry below and `docs/PHASE5_DESIGN.md` for the reasoning. Every item on the original "Still Open" list is now resolved one way or another.

**Note on this revision (Day 21, cont'd):** Phase 6 (Doctor Availability) is now closed. Like Phases 4 and 5, it grew from a standard gap/bug audit into real feature work once live testing surfaced actual bugs and a design conversation added a genuine new capability (leave scheduling) mid-phase. Full detail in the Phase 6 entry below.

**Note on this revision (Day 21, cont'd):** Phase 7 (Doctor Directory) is now closed — small, contained review as expected, one data typo fixed, admin-only write access confirmed intentional. Phase 8 (Notices & Circulars) is now closed — surfaced a real Storage rules gap (any authenticated user could write directly to Storage regardless of the app's role-gated buttons), fixed and live-verified. Full detail in the Phase 7 and Phase 8 entries below.

**Note on this revision (Day 21, cont'd):** Phase 9 (Patient Feedback) is now closed — started as the Day-13-flagged report bug, grew into a substantial feature phase: two new lightweight provider roles (Dentist/Physiotherapist), admin's feedback access removed entirely for privacy reasons, and a new standalone Suggestions feature built end-to-end. Fully live-verified from employee, CMO, and admin logins. Full detail in the Phase 9 entry below. Remaining backlog going into next session: Medical Trip (Phase 11 — never had its own review phase), Fitness Scheduling (Phase 12), and Reports (Phase 10, already scoped below).

**Note on this revision (Day 22):** Phase 11 (Medical Trip) and Phase 12 (Fitness Scheduling) are both now closed. Phase 11 started as the standard write-side gap audit and grew substantially once live testing began — a real family-linked patient-selection redesign, a reception cancellation-reason feature, a Rahimyarkhan-only doctor restriction, and a genuine mid-build mistake (wrongly assuming `familyMembers` was a subcollection) caught and corrected via live data. Phase 12 stayed small and contained as expected — one real gap (no history view for admin/CMO/doctor) plus a few small polish items. Full detail in each phase's entry below. Also fixed at the very start of this session, before Phase 11 began: the `purposeOfVisit` bug flagged during Phase 9's wrap-up (tracked only in Schema Reference at the time, not listed under Phase 9 above since it surfaced after that phase's own closing) — see the addendum under Phase 9. Only Phase 10 (Reports) remains before the full V1 module set has been through a dedicated review pass.

**Note on this revision (Day 24):** Phase 10 (Reports) is now **closed** — all 10 reports built, live-verified, and reviewed by Homi across two separate review passes; every open item from Day 23's list resolved one way or another. This is the last of the original 12 phases; the full V1 module set has now been through a dedicated review pass. Beyond the reports themselves, this session grew into real cross-cutting work the same way Phases 4/5/9/11 did: a join-key bug self-caught in three reports before it reached any real decision, the discovery that `employees` has no `isActive` field of its own, a new employee-deactivation cascade built to close that gap, and an `isActive`-enforcement security audit across every backend route file. Full detail in the Phase 10 entry below and in `docs/PHASE10_DESIGN.md`'s build-session addendum.

**Note on this revision (Day 23):** Phase 10 (Reports) requirements are now fully specced — 10 reports total (3 redesigns of existing screens, 7 new), covering every original report plus the two orphan `reportRoutes.js` routes decided in-scope (Fitness, Feedback). **Nothing has been built yet** — this session was requirements discussion and spec-locking only, plus two standalone bug fixes found while speccing (below). Full detail — every locked column, filter, access rule, and open question — is in the new `docs/PHASE10_DESIGN.md`, following the same relationship to this file that `PHASE4_DESIGN.md`/`PHASE5_DESIGN.md` already have. This entry only summarizes; see that file for the "why" behind every decision.

Two real bugs were found and fixed this session, both closed and live-verified before Phase 10 spec work continued:
- **`dateOfBirth` silently dropped at employee signup** — same silent-drop shape as `purposeOfVisit`/`hospital`: `SignupScreen.js` sent it, `authRoutes.js`'s `/register` never destructured or saved it. Fixed; now stored as a Firestore Timestamp, matching `familyMembers.dateOfBirth`'s type. Pre-fix employees have no recoverable DOB — accepted, since all current data is test data slated for deletion before launch.
- **`gender` never captured anywhere, for employees or family members** — not a silent-drop bug like the above; genuinely never existed on any record. Closed across seven files: signup, the employee self-edit route, My Profile's self-edit UI, and both family member add/edit screens (edits there routed through `pendingRevision`, same as name/DOB/CNIC/blood group on that screen). Unblocks Population Report's male/female breakdown figure.

Both fixes still need one follow-up whenever `SCHEMA_REFERENCE.md` is next touched: neither `employees.dateOfBirth` nor `employees.gender`/`familyMembers.gender` is documented there yet.

Build order across the 10 specced reports: simplest-first, decided and fully executed Day 24 — see the Phase 10 entry below for the actual sequence used.

**Note on this revision (Day 25):** Post-Phase-10 pre-launch hardening session, following directly from Day 24's data wipe and real-account creation. Four things closed: the signup-notification email was still hardcoded to a single dead `admin@ffl.com` address — fixed to dynamically notify every active `admin_incharge` account instead. That fix's own test then surfaced a genuinely broken SMTP setup (root cause: the Trigger Email extension's app password had never actually existed in Google's system — not a URI-encoding issue, which was ruled out first and wrongly suspected initially); fixed with a freshly generated, verified Gmail App Password, confirmed working end-to-end in both real admin inboxes. A new duplicate house/room-number warning was designed, built, and live-verified on the Pending Approvals screen — informational only, never blocks approval, since shared addresses are often legitimate (e.g. a working couple in one company house). SignupScreen's header branding swapped from a text placeholder to the real `FFCL_Logo.png` asset, centered and enlarged. Full detail in the new Pre-Launch Hardening section below. Several rounds of test accounts were created across this session's live verification — see the cleanup list at the end of that section, still pending removal.

---

## Quick Paths
- NAS project: /mnt/storage/projects/ffl-medical-centre/
- Frontend: app/src/  |  Backend: functions/src/
- GitHub: AwaizFatima08/FFL-Medical-Centre-App (private)
- Firebase project: ffl-medical-centre-app
- Web app: https://ffl-medical-centre-app.web.app
- Dev server: 192.168.100.122:8081 (Expo) | VS Code: 192.168.100.122:8080

## Daily Commands
*(unchanged — see repo history for full command list: dev server, deploy web/functions/rules, EAS build, backup script)*

**Reminder added Day 14:** `firebase deploy --only firestore:rules` is a separate deploy from functions/hosting and is easy to forget — a rules-only fix (as happened this session with the blood donor registry bug) does nothing live until this runs.

**Reminder added Day 25:** `authRoutes.js` deploys under the Cloud Function named **`auth`**, not `employees` — confirmed directly from a real `firebase deploy --only functions` log. The two are separate function groups; targeting the wrong one silently ships nothing. When unsure which function group a file belongs to, deploying all functions (`firebase deploy --only functions`, no target suffix) is the safer default over guessing a narrower one.

---

## Scope for V1 completion (locked, Day 13)

**In scope — 10 confirmed modules:**
User signup & validation, Family flow, Ambulance flow, Medical trip, Doctor availability, Doctor directory, Blood donor database, Notices & circulars, Patient feedback, Fitness scheduling. Reports is a cross-cutting view over these, not a separate module.

**Explicitly deferred to V2 — no exceptions:**
Vaccination flow, Lab module, Store/Pharmacy module, and any new idea or module raised during this review. Enhancements to the 10 in-scope modules found while evaluating them for gaps remain in scope; anything outside them does not.

**Standing decision:** No rushed publish. First public release should be impactful — quality over speed.

---

## Confirmed Feature Status (Day 14 update)

| Feature | Prior status said | Actual status |
|---|---|---|
| Family module | "Not yet built (V1 scope)" | **Built and functional** — 4 screens, full pending-revision approval flow, backend routes live |
| Report frontend screens | "Backend done, frontend pending" | **Built, live-verified, and reviewed** — all 10 Phase 10 reports complete (Day 24). Superseded the earlier "7 screens matching 7 endpoints" figure entirely — see Phase 10 entry |
| My Profile (employee self-service fields) | "Confirmed missing on both employee and admin side" | **Built and closed Day 14** — see Phase 4 |

---

## Way Forward — V1 Completion (Phases 1–12)

### Phase 1 — Confirmed live bugs — **CLOSED Day 13**
- [x] Residence Type split by branch (family vs bachelor) + bachelor question reworded to "Are you living in township bachelor accommodation?" — closed, tested, confirmed on both branches
- [x] Blood Donor Directory blocks admin & employee — role array in `blood-donors/:bloodGroup` route expanded to all 9 roles — closed, tested (manual `bloodDonorRegistry` test doc), confirmed both name/employee-number/phone displaying correctly
- [x] Blood Donor Directory missing employee number — added to write in both `employeeRoutes.js` (`PUT /:employeeId`) and `authRoutes.js` (`POST /complete-profile`, a second write path to the same collection, found and fixed in the same pass) and to read (`blood-donors` route) — closed, tested
- [x] ESB designation dropdown returns empty list — case mismatch fixed in both `app/src/constants.js` and `functions/src/constants.js` (`EMPLOYEE_TYPES.ESB` aligned to live `'ESB'`, `getDesignationsByType` now case-insensitive) — closed, verified live at Phase 4 (Employee Type chip selector)
- [x] Fitness report always shows zero for fit/unfit/conditional — `reportRoutes.js` `/fitness` route now reads `fitnessOutcome`; third bucket renamed `conditional` → `fit_with_restrictions` to match the real value — closed

### Phase 2 — Trip reports structural fix — **CLOSED Day 13**
- [x] Confirmed root cause: `reportRoutes.js` queried a `medicalTrips` collection (with `bookings` subcollection) that does not exist in live Firestore. Real data is flat, top-level `tripBookings`.
- [x] Rewrote `/trip-day`, `/trips/monthly`, `/trips` to query `tripBookings` directly
- [x] Added `getHospitalMap` helper — batched `doctorId` → `doctorDirectory.hospital` lookup
- [x] Found and fixed two additional bugs during the rewrite: seat counting summed booking count instead of `seats` field; status filter compared against a `BOOKING_STATUS.APPROVED` value that never appears in live data (real value is `'confirmed'`)
- [x] Required a new Firestore composite index (`tripBookings`: `status` + `tripDate`) — created, confirmed enabled, `firestore.indexes.json` re-exported
- [x] Verified live against May 2026 data
- [ ] Still not live-verified: Trip Day Report and the general `/trips` route — low risk (same query pattern as the verified route) but genuinely untested; carry forward to Phase 10

### Phase 3 — Code-only consistency fixes — **CLOSED Day 14**
Scope grew beyond the original 3 bullet points once live Firestore was checked field-by-field rather than assumed correct from the schema doc.
- [x] Marital status: `constants.js` `'single'` → `'unmarried'`, reordered to match live (`married, unmarried, divorced, widowed`) — both frontend and backend
- [x] Department/unit casing: 5 values corrected in `DEPARTMENT_GROUPS`, flat `DEPARTMENTS` list, and `UNITS` keys (`Admin`→`admin`, `Production_N`→`Production_n`, `Maintenance`→`maintenance`, `Process_Engineering`→`process_Engineering`, `Project_Engineering`→`project_Engineering`)
- [x] Designation lists corrected to match live Firestore exactly, not just the originally-scoped "low priority" items:
  - Management: added missing `Senior_Engineer_M9A`, fixed `Graduate_Trainee_Engineer_M5` value to the real `GTE_M5`
  - Non-Management: removed `Apprentice_Technician` (not in live config)
  - ESB: dropped the `ESB_` prefix from all values (live has none), removed `Head_Master` (not live), added `Supervisor` (live has it, code didn't)
- [x] **`UNITS` values — found to be more than a casing issue.** Several were factually wrong or missing entirely against live data, not just mis-cased: Maintenance had 7 fictional `_Field` units and was missing 7 real `_Machinery` units; HSEQT had `LDC` instead of `Learning_Development_Centre`; Project Engineering had `Civil_Plant` instead of `Civil_Plantsite`; E&I was a single placeholder instead of its 3 real units (Electrical/Instrument/Control_Systems); ESB was empty instead of having one real value; AIM was a placeholder instead of the real `Inspection`. All corrected to match live data exactly.
- [x] **Live Firestore itself corrected, not just code:** `units` map had 4 keys cased differently from the `departments` array values they're supposed to key against (`Maintenance`/`Production_N`/`Process_Engineering`/`Project_Engineering` vs. the array's lowercase-first versions) — this would have broken the live cascading dropdown regardless of any code fix, since the live data itself was internally inconsistent. Renamed directly in the Firestore console. A duplicate `"admin"` entry in the `admin` units array was also cleaned up.
- **Process note:** this phase is the reason Phase 4's later screens were built against verified live data via raw Firestore exports rather than the schema doc alone — the schema doc alone wasn't reliable enough once several factual (not just cosmetic) mismatches turned up here.

### Phase 4 — My Profile — **CLOSED Day 14**
Full design in `docs/PHASE4_DESIGN.md`. Originally scoped as 5 steps (cascading dropdowns → blood group/CNIC → blood donor consent → chronic disease → picture upload). What actually shipped is substantially larger — the design changed direction mid-build (admin-enters/employee-confirms instead of employee-submits/admin-approves) and three rounds of live testing surfaced real bugs, including one security issue that had been silently failing since it was introduced.

**Core build (Steps A–G):**
- [x] Backend hardened — employee self-edit of admin-owned fields (department/designation/blood group/CNIC/unit/employeeType) blocked at both the Express layer and, separately, at the Firestore rules layer (field-level `hasOnly()` restriction) — the two layers were found to disagree until the rules fix, meaning a direct client write could have bypassed the Express-only restriction
- [x] `/complete-profile` repurposed into `/confirm-profile` — employee confirms admin-entered data + sets blood donor consent, doesn't self-enter identity fields
- [x] Signup: added CNIC, marital status, smoker status (all three captured once at signup; CNIC locked after, marital status and smoker status stay self-editable)
- [x] Admin approval screen: full profile-data entry at approval time (Employee Type → Department → Unit → Designation cascade, Blood Group, Chronic Disease) — admin enters from HR records, employee only confirms
- [x] My Profile screen: two states (pre-confirmation review + confirm, post-confirmation view with self-editable marital status/smoker status/blood donor consent)
- [x] **Chronic disease moved to a protected subcollection** (`employees/{id}/private/medical`) after discovering the `employees` collection's open read rule meant a plain field would have been readable by any authenticated user, not just admin/CMO as intended — Firestore rules can't hide one field within an otherwise-open document, so this needed a real structural fix, not a rule tweak
- [x] Family tab alert system: tile badge, admin "Family Status" tab (flagged-employee list, manual re-flag with note, Mark Complete), auto-flagging on marriage transition
- [x] Admin spouse/child disable flow — Deceased/Divorced reason picker for spouse (auto-updates marital status to widowed/divorced), deceased-only for children, disabled members shown blurred with a status badge rather than disappearing

**Round 2 fixes (7 issues found in first live test pass):**
- [x] Admin had no way to edit an already-approved employee's data (only role/disable existed) — added full profile-data edit panel to `UserManagementScreen.js`
- [x] Family Status "Mark Complete" was unreachable for married-at-signup employees — Firestore's `in` filter never matches a missing field, and `familyDataStatus` was never set at signup; fixed by setting it explicitly at signup, plus adding Mark Complete to the manual-search path as a fallback
- [x] Chronic disease changed from free text to a fixed multi-select (Diabetes, Hypertension, Ischemic Heart Disease, Deranged Lipid Profile)
- [x] Smoker status added (signup + self-edit)
- [x] Family member blood donor consent — was entirely missing despite being in the original Phase 4 plan ("employee + family")
- [x] Disabled family members were disappearing from admin's view instead of showing blurred/disabled
- [x] Employee had no route to report incorrect data post-approval, only "confirm or nothing" — added a correction-request note, visible to admin on `UserManagementScreen.js` with a Mark Resolved action

**Round 3 fixes (3 issues found in final review pass):**
- [x] The correction-request option only existed on the *post*-confirmation screen — an employee who saw wrong data on first login had no way forward except falsely confirming. Added the same report option to the pre-confirmation screen.
- [x] Family member blood donor consent toggle was active for minors — disabled (not hidden) for family members under 18, with an explanatory hint
- [x] **Real bug:** family member consent toggles updated the family member's own record correctly but silently failed to create the `bloodDonorRegistry` entry the Directory actually reads from — a Firestore rules mismatch (registry doc IDs for family members don't equal the writer's own uid, which the original rule required). Fixed with an ownership lookup in the rule. **Any family member consent set before this rules fix was deployed needs to be re-toggled off/on to actually appear in the directory** — flagged to Homi, several test records needed this.

**Process notes carried forward from this phase:**
- When adding any new self-service write path, check the Firestore rules layer explicitly, not just the Express backend — the two are independent enforcement points and this phase found them disagreeing twice (admin-owned field self-edit; family member registry writes)
- When building an employee-level feature, check whether family members need the analogous feature before considering the module done — blood donor consent was in the original plan for both and only the employee half got built initially
- Verify live Firestore data directly (raw export) before building UI that assumes a schema doc is accurate — Phase 3 already established this, Phase 4 confirmed it again

### Phase 5 — Ambulance flow redesign — **CLOSED Day 21**
Originally scoped as a standard gap/bug audit. Live testing (screenshots covering employee/reception/driver flows, cancellation, notifications, completion) plus a full design discussion with Homi turned it into a near-total redesign of the operational model. Full design in `docs/PHASE5_DESIGN.md` — this entry only tracks build sequence and status. All subphases below built and live-verified across reception, Doctor, and CMO logins. 5.7 was formally decided **not** to be built — see `docs/PHASE5_DESIGN.md`'s "Explicitly Not Solved By This App" section for the reasoning and accepted consequence, not a gap that was missed.

**Confirmed during code review + live screenshots (not redesign, just real bugs) — all closed:**
- Firestore rules gap: `ambulanceRequests` update rule allowed any `employee` role to directly write any field via client SDK, bypassing all backend role/state logic — **closed (5.1)**
- "Purpose of Visit" captured on both request screens but never persisted by the backend — **closed (5.2)**
- Employee cannot view or cancel their own submitted request — **closed (5.5)**
- Neither CMO nor Doctor home screen had any ambulance tile — **closed (5.8.1)**

**Operating reality the redesign is built around:** one driver per shift (not one per vehicle) — Bolan (general seating, non-AC, within-township) and Hiace/BLS (stretcher, paramedic-equipped) can never both be in motion at once. No dedicated emergency driver exists or is planned near-term; vehicle-switching cost during an emergency is an accepted limitation, not something this app solves (see 5.7 below).

**Subphase sequence — all closed:**
- [x] **5.1 — Firestore rules fix** — locked down `ambulanceRequests` update rule to match backend's actual role/state logic.
- [x] **5.2 — Purpose of Visit persistence** — field now saved and surfaced on dispatch cards/detail screen.
- [x] **5.3 — Family member dropdown** — replaces free-text Patient Name on employee + reception request screens; excludes disabled family members.
- [x] **5.4 — Single system-wide queue + emergency bypass** — one active-trip slot, lock at `dispatched`→`completed` (not `accepted`). Employee sees plain queue-position number, no ETA. **Live-verified across multiple real scenarios.**
- [x] **5.5 — Employee-side self-service** — view own request (`GET /my-active`), cancel while still pending, duplicate-active-request block per patient via `employeeNumber`.
- [x] **5.6.1–5.6.3 — Driver on-duty tracking, auto-assignment, Confirm Arrival/Drop Off split** — `onDuty` flag replaces manual driver picker; `Complete Request` split into `Confirm Arrival` (vehicle freed, request stays open) and `Drop Off`/`Drop Off Not Required` (final close-out, two fixed reasons, no free text).
- [x] **5.7 — Emergency mid-route diversion — decided NOT to build (Day 21).** Discussed in depth; same "don't over-engineer for an edge case" reasoning applied elsewhere in this phase. The driver's existing Cancel Trip action (fixed reason: "Diverted for another emergency call," Day 18) is the accepted permanent mechanism for this scenario — not a stopgap pending 5.7. See `docs/PHASE5_DESIGN.md` §5 and "Explicitly Not Solved By This App" for the three real-world scenarios this covers and the one accepted historical-record gap (mid-route drop location/outcome not distinguished from a clean pre-pickup cancellation).
- [x] **5.8 — CMO / Doctor ambulance dashboard.** Resolved scope: **both** live + historical views, **both** CMO and Doctor with full write parity (not view-only — "CMO may be on leave at some time"). Built in three parts, all live-verified Day 21:
  - **5.8.1** — `doctor` added to every ambulance write/read role check (accept/assign/dispatch/arrive/dropoff/cancel, plus previously-excluded `GET /:id`/`GET /active`/`GET /on-duty-driver`); tile added to both `CMOHome.js` and `DoctorHome.js` pointing at the same `AmbulanceReceptionHub` reception already uses. Doctor drove a full lifecycle (Accept→Dispatch→Arrival→Drop Off) live; CMO independently verified Accept/Cancel.
  - **5.8.2** — new `AmbulanceCMOHistoryScreen`: full-status history (no default restriction, unlike 5.9) + Response Time KPIs panel. Extended `reportRoutes.js` `GET /ambulance` (status/employeeSearch/falseEmergencyOnly filters, acceptedByName resolution) and `GET /ambulance/kpis` (added fromDate/toDate, added doctor role) rather than forking new routes.
  - **5.8.3** — false-emergency checkbox on the Drop Off action, shown only for emergency-flagged requests. Flag routes a dedicated notification to CMO (not Doctor — treated as an administrative/disciplinary matter) and surfaces via a filter chip + row tag in 5.8.2's history screen. Resolves the "Reclassification" open item — closure-time flagging instead of a live-reclassify tool, since the call can't be made before the patient arrives and shouldn't rest on instinct mid-trip.
- [x] **5.9 — Reception history/filter view.** Reception-only, standalone screen, default scope completed+cancelled only (narrower than 5.8.2's CMO/Doctor screen). Filters: date range, employee search, status, priority. Columns: patient name, employee #, status, initiated-at, accepted-by.
- [x] **Small fixes bundle (Day 18)** — emergency Accept-time hard block (reception/CMO/Doctor cannot accept a routine request while an emergency sits pending — locked as a hard rule after live testing showed the original advisory behavior letting a routine request ("Q3") jump ahead of a pending emergency); employee-facing intercity-away banner on the "My Ambulance Request" screen, alongside the queue-position line.

**All items from the original "Still Open" list are resolved** — see `docs/PHASE5_DESIGN.md`'s "Formerly Still Open" section for the full resolution of each (4 AM auto-cancel dropped; queue-position scope confirmed system-wide; reception on-behalf-of flow needed no further change; CMO/Doctor scope resolved to both+both; reclassification resolved via 5.8.3; `EmployeeHome.js` review deferred to pre-publish UI pass, non-blocking).

**V2 backlog additions from this phase (not built, logged for later):**
- GPS tracking of vehicle, visible to reception
- WhatsApp integration — automated messages to employees waiting in queue
- Driver-side dashboard with queue visibility and emergency auto-alert — originally scoped to be designed together with 5.7; since 5.7 was decided not to be built, this V2 item would need fresh scoping if revisited, not a resumption of the original note

**Files touched across Phase 5 (final list):**
`firestore.rules`; `functions/src/ambulance/ambulanceRoutes.js`; `functions/src/auth/authRoutes.js`; `functions/src/reports/reportRoutes.js`; `functions/src/constants.js` + `app/src/constants.js`; `app/src/screens/ambulance/AmbulanceRequestScreen.js`, `AmbulanceRequestReceptionScreen.js`, `AmbulanceReceptionHubScreen.js`, `AmbulanceRequestDetailScreen.js`, `MyAmbulanceRequestScreen.js`, `AmbulanceHistoryScreen.js` (new, 5.9), `AmbulanceCMOHistoryScreen.js` (new, 5.8.2); `app/src/screens/home/DriverHome.js`, `CMOHome.js`, `DoctorHome.js`; `app/src/navigation/AppNavigator.js`.

### Phase 6 — Doctor Availability review — **CLOSED Day 21**
Started as a standard gap/bug audit. Live testing surfaced a real bug chain rooted in a single cause, and a follow-up conversation with Homi turned the back half of this phase into a genuine feature build (leave scheduling) plus two smaller enhancements discovered through testing the feature itself.

**Root-cause bug chain — all closed:**
- **"Unknown" doctor displayed instead of a real name.** Root cause: `doctorAvailability` docs are meant to be keyed by the doctor's own Firebase uid (matching the pattern `employees`/`users` already use), but nothing in the codebase ever auto-creates this doc — it has always relied on hand-creation in the Firestore console. Dr. Jamil's doc had been created under a mistyped ID (`O` instead of `0` — visually identical, confirmed only by pasting both values as plain text and diffing character-by-character). Fixed by recreating the doc under the correct, copy-pasted uid.
- **Scheduler (`availabilityScheduler.js`) silently using the wrong working-hours schedule for the CMO.** The scheduler reads a `role` field to decide Doctor vs. CMO hours, but no existing doc had `role` set at all — meaning every doctor, including Homi as CMO, was being checked against the DOCTOR schedule regardless of actual role. CMO and DOCTOR hours differ by ~1h45m at both ends of the day, so this was a real (if quiet) mis-scheduling, not just a data-hygiene issue. Fixed via a one-time backfill (`role: 'doctor'` / `'cmo'`, lowercase — a second bug was caught here too, one doc briefly had `"CMO"` uppercase, which the scheduler's exact-match check would have silently ignored).
- **Root fix — `doctorAvailability` docs now auto-created at approval.** `POST /approve-user` in `authRoutes.js` now creates the doc automatically, keyed by the uid Firebase Auth already assigned (never hand-typed), whenever a user is approved as `doctor` or `cmo`. Only fires at initial approval — a later role change via `/change-role` is a known, accepted gap, not handled (Homi's call: low real-world likelihood given team size).
- `isAvailable` field confirmed fully dead — written but never read anywhere in the route or either screen. Decision: leave it dormant rather than remove it, since removing live data has its own small risk for no real benefit.

**Leave-scheduling feature (built from a live conversation about Homi's own attendance pattern) — closed:**
- Reception can pre-schedule a doctor's leave (start date + end date) in advance; nothing changes on screen until the start date arrives.
- Computed live, not via a background job — every time the availability list loads, the backend checks whether today falls inside the doctor's scheduled window and overrides the displayed status to On Leave if so. Avoids the failure mode of a cron job that could silently stop running.
- Auto-reverts to whatever the doctor's manual status was before the leave began, the moment the end date passes — no action needed from reception.
- Reception can view and cancel an active or upcoming scheduled leave at any time.
- **Found through testing the feature itself, not the original ask — the manual status buttons (Available/Not Available/On Leave) are now disabled with an explanatory note whenever a scheduled leave is active**, since tapping them during that window would silently do nothing (the leave override always wins on the next refresh) — this was confirmed live before being fixed, not just reasoned about in the abstract.

**Not Available — tentative return time (added after a follow-up request, extending the same module):**
- Reception can optionally set a tentative return time when marking a doctor Not Available (e.g. "leaves for 2 hours, back tentatively at ___") — genuinely optional, confirming with no time given still works.
- Shown on both reception's and the employee-facing screen ("⏰ Expected back around 3:30 PM"), directly targeting Homi's stated pain point of employees complaining about unexplained non-availability.
- Automatically cleared the moment status changes away from Not Available — no stale times can linger.
- Employees also now see the scheduled leave's return date under On Leave ("📅 Back on 11 Sept 2026") — added for parity with the Not Available treatment above, guarded so a stale/expired scheduled-leave field can never mistakenly display next to an unrelated, manually-set On Leave status.

**Process notes from this phase:**
- Hand-typed Firestore document IDs are a real, repeatable failure mode — `O`/`0` is genuinely indistinguishable at a glance even zoomed in. Diagnosing this required pasting values as plain text and diffing character-by-character, not eyeballing screenshots. Worth remembering for any future hand-created document ID.
- A dual-purpose collection field (`currentStatus` vs. `isAvailable`) drifting apart in live data, exactly like Phase 3's config-vs-code mismatches, surfaced again here — worth continuing to check "is this field actually read anywhere" before trusting it during future audits.
- This phase is a second confirmation (after Phase 4, Phase 5) that a live-testing round can surface a real interaction bug (the locked-buttons case) that pure code review wouldn't have caught — round-based testing discipline continues to earn its keep.

**Files touched across Phase 6:**
`functions/src/auth/authRoutes.js`; `functions/src/utils.js`; `functions/src/availability/availabilityRoutes.js`; `app/src/screens/availability/DoctorAvailabilityScreen.js`, `DoctorAvailabilityManageScreen.js`. (`availabilityScheduler.js` diagnosed but not code-changed — fixed via the `role` backfill, no logic change needed.)

### Phase 7 — Doctor Directory review — **CLOSED Day 21**

Small, contained review as expected — flat reference-catalogue module, no state machine, no links into other collections.

**Findings — all resolved:**
- Admin view initially appeared blank in a screenshot; re-checked live and confirmed it renders correctly with the Add Doctor button — was a capture issue, not a real bug.
- "Gyenecologist" data typo in `speciality` field for Dr. Shazia Majid Khan — corrected directly in Firestore console to "Gynecologist."
- Edit and Delete confirmed present and working from the Doctor Details screen (admin login) — full CRUD exists, contrary to initial concern that only Add/view existed.

**Access confirmed (by design, not a gap):** Add/Edit/Delete restricted to admin only. Reception, CMO, doctor, and employee logins are read-only. Confirmed intentional.

**No code changes required this phase** — module was already correctly built; review surfaced one data-entry typo and confirmed intended access model.

### Phase 8 — Notices & Circulars review — **CLOSED Day 21**

Standard gap/bug audit surfaced one real security gap, not a UI bug.

**Finding — resolved:** Storage rules for `circulars/` were `allow read, write: if request.auth != null` — any authenticated user, any role, could write directly to Storage regardless of the app's role-gated Upload/Delete buttons (which only blocked the *button*, not the underlying write). Backend (`circularRoutes.js`) correctly checked role for its own `/save` and `/delete` routes, but the file upload itself bypasses the backend entirely (client uploads straight to Storage per the module's designed flow) — so the backend check alone gave no real protection.

**Root cause, same shape as Phase 4's `bloodDonorRegistry` bug:** UI restriction and backend restriction existed; the third layer (Storage rules) didn't match either.

**Fix:** Storage rules rewritten — `circulars/` allows read to any authenticated user, write restricted to `admin_incharge`/`cmo` via Firestore role lookup, matching the backend's own role check. Everything else in Storage (`reports/`, written only by Cloud Functions via Admin SDK) locked down by default catch-all, deferred for reassessment at Phase 10 if report screens turn out to need direct client reads.

**Live-verified:** admin/CMO upload, view, and delete all still function correctly after the rule change; non-admin roles confirmed unable to access Add/Delete.

**No other issues found** — tabs, counts, Open/Delete flows, and role-gated UI all functioning correctly.

**Process note:** third confirmation (after Phase 4, Phase 6) that a module can look fully correct from the UI down through backend code, with the actual gap sitting in a layer that's easy to forget exists — worth keeping "how many enforcement layers does this write path touch" as a standing question, not just for new features but for reviewing already-built ones.

**Files touched:** `storage.rules` only. No app or Cloud Function code changed.

### Phase 9 — Patient Feedback review — **CLOSED**

Started as the Day-13-flagged report bug, grew into a substantial feature phase after live testing and design discussion — new roles, new UI patterns, a security-adjacent access decision, and a standalone new feature (Suggestions), all built and live-verified.

**Confirmed bug, fixed:** `reportRoutes.js`'s `/feedback` route was reading field names that don't match the real schema (`f.staffBehaviourRating` instead of nested `f.ratings.staffBehaviour`, `f.comments` instead of `f.overallExperience`, a nonexistent `f.isAnonymous`, and a `servicesRating` field that was never real — per-service ratings are individual fields). Every average had always silently returned `null`. Fixed; `services` now averages across all per-service ratings combined; `waitingTime` added (was missing entirely); `anonymous` removed (no schema basis). Role list locked to CMO only, matching the rest of the module — previously Doctor and Reception could see aggregate stats despite no access to individual entries. No frontend screen exists for this report yet (per Day 13 note) — fix is backend-only, verified by code review and syntax check, not a live screen; Phase 10's job to wire up.

**New roles — Dentist & Physiotherapist:** third-party providers engaged for in-house paid services, feedback-attribution only. Deliberately lightweight — real Firebase accounts via the existing Signup + Admin Approval flow (so UIDs are always auto-assigned, never hand-typed, avoiding a repeat of the Phase 6 "O vs 0" bug), but no `doctorAvailability` doc, no dashboard, no scheduling hookup. Approval screen skips the entire internal-employee profile section (department/designation/blood group — none of it applies to a contracted provider) for these two roles specifically, replaced with a short explanatory note. Assigned via dummy employee numbers in the existing `FFL-00000` format, per Homi's call — no over-engineering a fit where none exists. Live-verified end to end: approved as Dentist and Physiotherapist, both show correctly in User Management with the right role, both appear as selectable providers in the feedback form's provider list, confirmed from a real employee login.

**Admin access removed entirely:** Patient Feedback tile removed from Admin Dashboard; `GET /all` and `GET /:feedbackId` in `feedbackRoutes.js` locked to CMO only (`DELETE` was already CMO-only). Reasoning: protecting the identity of who reported what about a teammate — CMO-only review, consistent with how sensitive feedback data is treated everywhere else in this module. Live-verified — tile confirmed gone from Admin Dashboard grid.

**New standalone Suggestions feature:** general-purpose suggestion box, deliberately separate from per-visit feedback. Reached via a bold toggle ("📋 Give Feedback" / "💡 Suggest Something") at the top of the employee feedback form — restructured so the toggle is never blocked behind the doctor-list loading spinner. Reviewed by CMO as a second tab on the Feedback list screen, styled with a distinct amber accent matching the submission side so it reads as one connected feature. New `suggestions` Firestore collection; new `/suggestions/submit`, `/suggestions/all`, `/suggestions/:id` (delete) routes, same access model as feedback (any employee submits, CMO only reviews/deletes). Logged as a deliberate V1 addition after discussion, not scope creep — considered and rejected as its own dashboard tile in favor of staying inside the existing module. Live-verified from both employee (submit) and CMO (review, tabs, counts) logins.

**Other fixes:**
- Visit Date and Visit Time on the feedback form converted from free-text to proper pickers (`DatePickerField`, and a new sibling `TimePickerField` built to match) — removes the risk of a malformed date/time string reaching the backend unchecked.
- Per-visit "Suggestion for Improvement" field removed from the feedback form entirely, superseded by the new standalone Suggestions feature.
- "Consulting Doctor" relabelled "Consulting Doctor / Provider" since the list can now include non-doctor providers.

**Process notes:**
- A mid-build editing mistake (a `str_replace` that silently deleted a needed line) was caught only because every file was run through a real JS/JSX parser before being handed over, not trusted by eye — this is now the standing practice for every file this project touches going forward, not just when something feels risky.
- Third confirmation this project that a feature can look fully wired from the UI down through the backend, with the one path that actually proves it works — a real end-to-end account — left untested until specifically checked. Worth continuing to ask "has the actual new-role path been run, not just the code path" before closing out role-related work.
- The doctors list is now shared between real doctors (via `doctorAvailability`) and lightweight providers (via `users` role lookup) — a good example of extending an existing data shape rather than forking a parallel one, worth keeping as a pattern for any future lightweight-role additions.

**Files touched:** `functions/src/constants.js` + `app/src/constants.js`; `functions/src/feedback/feedbackRoutes.js`; `functions/src/reports/reportRoutes.js`; `app/src/screens/admin/UserApprovalScreen.js`; `app/src/screens/home/AdminHome.js`; `app/src/screens/feedback/FeedbackFormScreen.js`; `app/src/screens/feedback/FeedbackListScreen.js`; `app/src/components/TimePickerField.js` (new).

**Day 22 addendum:** A bug found during this phase's own wrap-up but only tracked in Schema Reference at the time (not listed above since it surfaced after this phase closed) — `FeedbackFormScreen.js` requires `purposeOfVisit` and sends it on every submission, but `feedbackRoutes.js`'s `POST /submit` never destructured or saved it, silently dropping it on every single submission ever made. Fixed at the start of Day 22's session, before Phase 11 began: one-line addition to the destructure and the `.set()` call. Two follow-ups from this same fix remain open, not yet built: no server-side validation actually enforcing the field as mandatory, and `GET /all`/`GET /:feedbackId` still don't project it into their response shape — so it's saved going forward but not yet visible on the CMO's review screens.

### Phase 10 — Reports review — **CLOSED Day 24**
Held until last, deliberately, so reports could be reviewed against live data produced by every other module's own completed review phase rather than assumptions — this paid off directly during the Day 23 spec session: reviewing Ambulance KPI Report surfaced that `falseEmergencyFlag` already existed live but was undocumented; reviewing Employee Report surfaced the `dateOfBirth` bug; reviewing Population Report surfaced that `gender` had never been captured anywhere. Full detail on every report's spec in `docs/PHASE10_DESIGN.md`; this entry summarizes both the spec session and the build session that followed it.

**10 reports specced (Day 23), built and live-verified (Day 24) — 3 redesigns/merges of existing screens, 7 new:**
1. **Trip Day Report** — redesign of `TripDayReportScreen.js`. 10 columns, summary strip, any date past/future (unlimited), filters, reception+admin+doctor+CMO. Confirmed working.
2. **Trip Range Report** — full replacement of `TripMonthlyReportScreen.js` (different query shape: from/to range, not month+year). 8 columns, past-only, CMO only. Confirmed working; old screen deleted.
3. **Ambulance KPI Report (Daily + Range)** — redesign of `AmbulanceKPIReportScreen.js`. 12 columns, labels adjusted to match schema exactly, past-only unlimited, CMO only. Required a prerequisite capture-flow change (`houseNumber` auto-lock — see below) before the report itself could be finished. Confirmed working.
4. **Employee Report** — new, consolidates `EmployeeOnlyReportScreen.js` + both branches of `PopulationReportScreen.js` into one screen with filters. One row per employee. CMO only. Confirmed working (after the join-key bug fix below); old screens deleted.
5. **Family Report** — new, split out from #4. Default 1 spouse + 5 children column groups, collapsible beyond that in-app, always fully expanded in PDF. Multi-spouse handling confirmed to mirror the children pattern exactly, per Pakistani family law's up-to-four-wives provision. CMO only. Confirmed working (after the same join-key bug fix).
6. **Blood Donor Report** — full redesign/replacement of `BloodGroupReportScreen.js`. Reads `bloodDonorRegistry` instead of `employees` directly, live-filters on active/validated status. Export kept as **both CSV and PDF**, not switched to PDF-only — Homi's explicit call, deviating from this batch's universal PDF-only rule (CSV is more flexible for downstream analysis). admin+reception+doctor+CMO. Confirmed working; old screen deleted.
7. **Employee Chronic Disease Report** — new. Reads `private/medical`. CMO only. Confirmed working.
8. **Population Report** — new. Tiled/summary-card shape. 12 figures. **One assumption never explicitly confirmed by Homi, flagged for awareness even though the report passed review overall:** figure 9 (marital status breakdown) was built company-wide, not scoped to township residents — the spec numbered it standalone ("9.") rather than nested under the "5–8" township group the age/gender figures explicitly are, which was the reasoning at build time, but it was a judgment call, not a confirmed instruction. CMO only. Reviewed and verified by Homi.
9. **Annual Fitness Report** — new, resolves one of the two orphan `reportRoutes.js` routes. Backend already existed and was already correct; only the frontend needed building. CMO only. Built; one open finding — Department/Unit showed blank for 3 of 4 test employees on first live test, deferred to fresh-data review since it's plausibly a genuine data gap (pre-fix test accounts) rather than a join bug — not yet re-confirmed either way.
10. **Feedback Report** — new, resolves the other orphan route. Tiled shape with a monthly trend chart. **Built without any charting library** — none was confirmed available in the project, so the trend chart is a plain-View grouped bar chart (React Native core components only), not a line-chart library. Can be upgraded later if a real charting library turns out to be present. CMO only. Confirmed working.

**Orphan-route decision — now fully resolved (was 5 routes, 2 already handled by the spec above):** Fitness and Feedback both built (#9, #10). Vaccination stays V2. `/ambulance` was never actually orphaned (has a frontend consumer, `AmbulanceCMOHistoryScreen.js`). **`/trips`** — `reportRoutes.js`'s general date-range/month booking summary — confirmed genuinely orphaned this session, traced end-to-end through `api.js` and `tripRoutes.js` (a separate Cloud Function with its own unrelated `GET /all`, not the same route despite the similar name); removed, along with its only-used-there `dayOfWeekFrom` helper.

**All open items from Day 23 resolved:**
- Family Report's multi-spouse handling → confirmed, same collapsible pattern as children.
- Ambulance KPI Report's `houseNumber` auto-lock → resolved as a **new, separate, auto-locked field**, snapshotted server-side at request creation (both self-request and reception-on-behalf paths), never trusted from the client. The existing `pickupLocation` field was deliberately left untouched — still free-text, still overridable, since dispatch genuinely sometimes needs a pickup point other than the patient's registered address. This was a real design fork (a narrower reading would have locked `pickupLocation` itself, killing that flexibility) — resolved via Homi's direct call.
- Blood Donor Report's CSV→PDF switch → resolved as **keep both**, not a switch.
- Build order across all 10 reports → simplest-first, decided and executed: Annual Fitness → Trip Day → Trip Range → Employee Chronic Disease → Blood Donor (deferred, see below) → Feedback → Employee → Population → Family → Ambulance KPI.
- `/trips` orphan-route status → resolved, see above.
- `SCHEMA_REFERENCE.md` additions → done this session (Day 24 revision).

**Genuine mid-build bug, self-caught — flagged clearly, same shape as Phase 11's subcollection mistake:** Employee Report, Population Report, and Family Report were all initially built joining `familyMembers` against `employees.id` (the employees collection's own auto-generated doc ID) instead of `employees.userId` (the actual join key — `familyMembers.employeeId` stores the Auth UID). This silently produced a family count of 0 in all three reports. Caught and fixed before any of the three were used for a real decision — `FamilyAdminReviewScreen.js`'s own existing code comment already stated the correct join key, which is what surfaced the mistake on review. See `SCHEMA_REFERENCE.md`'s `familyMembers` section for the permanent standing-gotcha note this produced.

**Blood Donor Report deferred mid-build, then resolved as its own mini-project:** building Blood Donor Report's live-status filter required checking whether a donor's sponsoring employee was still active — and surfaced that `employees` has **no `isActive` field of its own**, only the linked `users` doc does. Rather than patch around this narrowly, it was treated as a real, separate design discussion (Homi's explicit call, matching how Phases 4/5/6 grew from quick audits into full design sessions once a genuine gap turned up):
- **New employee-deactivation cascade, `authRoutes.js`.** `POST /disable-user` now batch-disables every one of that employee's currently-active `familyMembers` in the same request, tagged `disabledReason: 'sponsor_deactivated'` — distinct from the pre-existing `deceased`/`divorced` reasons an admin sets on an individual member via `FamilyAdminReviewScreen.js`. `POST /enable-user` reverses it symmetrically, restoring only members carrying that specific tag — a genuinely deceased or divorced member stays disabled even if the sponsor is later re-enabled. Both were confirmed via direct questions to Homi, not assumed.
- **Security gap found and closed while building the cascade:** `authRoutes.js`'s shared `verifyRole` middleware checked role membership only, never `isActive` — a disabled account with a still-valid token could keep using any route built on that middleware. Fixed in `verifyRole` itself (protects `reportRoutes.js`, `employeeRoutes.js`). Every other backend file has its own separate role-check pattern rather than importing that middleware, so each needed auditing individually: `fitnessRoutes.js` and `notificationRoutes.js` already had their own independent `isActive` check (no fix needed); `ambulanceRoutes.js`, `tripRoutes.js`, `directoryRoutes.js`, `circularRoutes.js` did not and were fixed (in each case, one line inside a shared `getUserRole()` helper every route in the file already calls first); `availabilityRoutes.js`'s write routes are protected, its read-only `GET /all` is not — left open, low-risk. `vaccinationRoutes.js` deliberately not audited (V2 scope). `LoginScreen.js` was separately confirmed to already correctly block sign-in for a disabled account — this fix is defense-in-depth for an already-active session, not the primary gate.
- **Four census-shaped reports retrofitted with the same `isActive` check:** Employee Report, Employee Chronic Disease Report, Population Report, Family Report now all exclude an employee whose linked `users.isActive` is `false`, not just unvalidated ones. Deliberately *not* applied to the four historical/event-log reports (Trip Day/Range, Ambulance KPI, Annual Fitness, Feedback) — those record things that already happened, and filtering by current status would hide real past events and skew trend data.
- **`FamilyAdminReviewScreen.js` bug found and fixed while building this:** its disabled-member badge was a two-way `deceased`/else-"Divorced" ternary — a member cascade-disabled via the new `sponsor_deactivated` reason would have silently displayed as "Divorced," which is both wrong and could be genuinely upsetting to see next to a child's name. Fixed to handle all three real values explicitly.
- **`UserManagementScreen.js` updated** to mention the cascade in both confirmation dialogs (previously said nothing about family members being affected) and to show success feedback naming the affected family-member count, but only when it's greater than 0 — most accounts (drivers, reception, etc.) have no family members, so this stays quiet for the common case.

**File cleanup, done across two passes:** `TripMonthlyReportScreen.js`, `EmployeeOnlyReportScreen.js`, `BloodGroupReportScreen.js` deleted (replaced screens, confirmed orphaned). `PopulationReportScreen.js` deliberately held back as a fallback until Employee Report and Population Report were both confirmed working in live review, then deleted along with its two now-dead `AppNavigator.js` nav entries (`TownshipReport`/`NonTownshipReport`).

**Files touched (build session):** `functions/src/reports/reportRoutes.js` (all 10 report routes, `/trips` removal); `functions/src/ambulance/ambulanceRoutes.js` (houseNumber auto-lock, isActive fix); `functions/src/trips/tripRoutes.js`, `functions/src/directory/directoryRoutes.js`, `functions/src/circulars/circularRoutes.js` (isActive fix); `functions/src/auth/authRoutes.js` (verifyRole isActive check, disable/enable cascade); every `app/src/screens/reports/*.js` file (new + redesigned); `app/src/navigation/AppNavigator.js`; `app/src/screens/family/FamilyAdminReviewScreen.js`; `app/src/screens/admin/UserManagementScreen.js`.

### Phase 11 — Medical Trip review — **CLOSED Day 22**
Started as the standard write-side gap audit (per the Day 13 scope note — this module had never had its own review phase). Grew substantially once live testing began, the same pattern as Phases 4/5/9.

**Confirmed bugs, fixed:**
- `hospital` field silently dropped at booking despite the frontend already sending it — `TripBookingScreen.js` sent it, `tripRoutes.js`'s `POST /book` never destructured or saved it. Same shape as Phase 9's `purposeOfVisit` bug. Schema Reference updated with the caveat that bookings made before the fix have `hospital: null` permanently — no way to backfill except cross-referencing `doctorId` against `doctorDirectory.hospital`.
- `GET /employees/profile` didn't exist. `employeeRoutes.js` only had `GET /:employeeId`, which silently swallowed `/profile` as if it were a literal (non-existent) employee ID and always 404'd. This was the root cause of House Number auto-fill always coming back blank on the booking form. Added the missing route, positioned above `/:employeeId` — same Express route-ordering principle `tripRoutes.js` already documents for its own `/confirmedCount`/`/all`.
- Dead/wrong trip constants in `app/src/constants.js`: `MEDICAL_TRIP_TOTAL_SEATS` said 26 against a real live cap of 24; `BOOKING_STATUS` used `'approved'`, the exact same live-data mismatch already found and fixed inside `reportRoutes.js` back in Phase 2, but never corrected at its source. Corrected rather than deleted, since not confirmed unused outside this session's reviewed files — `functions/src/constants.js` not yet checked for the same drift.

**New capability — family-linked patient selection:** Patient Name/Relation was free text — any relation, any name, no connection to real family records. Redesigned so relation chips are computed from the employee's actual data (Self always; Spouse only if `maritalStatus === 'married'`; Son/Daughter always offered). For anything but Self, the employee must now pick from their own real, validated, active `familyMembers` records rather than typing a name. Father/Mother/Other/Wife dropped from the relation set entirely — `familyMembers` never modeled parents or other relatives in V1, so those options could never be verified against anything real; "Wife" relabelled "Spouse" since the underlying schema is gender-neutral. When no matching family member exists yet, the employee is directed to book under Self with a note in the existing `notes` field — deliberately no new dedicated field, and deliberately **no** reception override/proxy-booking escape hatch (Homi's explicit call — keeps pressure on completing real family records rather than working around gaps). Saves a real `patientFamilyMemberId` link, verified server-side (not just filtered client-side): confirms the record exists, belongs to the requesting employee, matches the claimed relation, and is validated + active.

**Bug found and corrected mid-build — flagging clearly so it isn't repeated:** the family-member picker was initially wired to `employeeRoutes.js`'s `/:employeeId/family-members` routes, which write to and read from `employees/{id}/familyMembers` as a subcollection. Live testing (Boota's and Majid's bookings both coming back empty despite real registered family members existing) proved this wrong — `familyMembers` is a top-level collection, exactly as Schema Reference already stated, and those `employeeRoutes.js` routes are dead code nothing else populates. `EmployeeHome.js` already queried the correct top-level collection; corrected `TripBookingScreen.js` and `tripRoutes.js`'s server-side verification to match. Flagged for a future Family-module session: those dead subcollection routes should probably be removed or investigated, not left as a second, wrong integration point.

**New capability — reception cancellation reason:** `POST /:id/cancel` now requires a free-text reason when reception cancels someone else's booking (saved to `cancelReason`, internal only); employee self-cancellation needs no reason and none is stored. The employee-facing notification is always one fixed, generic line regardless of what reception actually typed — mirrors the Ambulance module's existing fixed driver-cancel-reason pattern. No reception proxy-booking escape route. Admin's cancel permission removed from this route as part of a broader call this session: Admin's trip access is now read-only (view-only, same `TripViewScreen.js` CMO/Doctor already use).

**New restriction — Rahimyarkhan-only doctor selection:** the trip only travels to Rahimyarkhan, but the doctor picker was pulling the full, city-blind directory — a Lahore-based doctor was successfully selected and the booking accepted during live testing before this was caught. Restricted both the frontend picker and a matching backend check in `POST /book` to `city === "Rahimyarkhan"` only. Doesn't touch `doctorDirectory`'s own schema or its other consumers — the general Directory screen still shows every city.

**Process notes:**
- The family-member bug was only caught because Homi ran real bookings for real employees (Boota, Majid, Qasim) against real Firestore data — nothing about reading the code alone would have surfaced it; the code looked internally consistent right up until live data proved the underlying assumption wrong. Same "has the real path actually been run" lesson as Phase 9, reconfirmed.
- The wrong assumption was made despite the correct answer already sitting in this project's own Schema Reference doc and in already-reviewed code (`EmployeeHome.js`) — worth remembering that checking existing docs and already-read code before wiring up a new integration applies even mid-phase, not just at the start of a review.
- Trip Report structural observations from this phase's live testing were deliberately not folded in here — carried forward to Phase 10 per Homi's explicit call, to be tackled last, after Phase 12.

**Files touched:** `functions/src/trips/tripRoutes.js`; `functions/src/employees/employeeRoutes.js`; `app/src/screens/trip/TripBookingScreen.js`; `app/src/screens/trip/TripDetailScreen.js`; `app/src/constants.js`.

### Phase 12 — Fitness Scheduling review — **CLOSED Day 22**
Small, contained review as expected — Homi confirmed other features already checked and working; one real gap plus a few small polish items.

**Confirmed bug, fixed:** `FitnessAdminScreen.js`'s tab literally labeled "All" only ever rendered `activeAppointments` (status not `completed`/`cancelled`) — the moment an exam was marked complete, it vanished from admin/CMO/doctor view entirely, with no way to look it up again. The backend (`GET /all`) was already fine — it returns everything and already supports `cycleYear`/`status`/`date` filtering; this was purely a frontend gap, nothing to fix server-side. Renamed "All" → "Active" (honest about what it always showed) and added a new "History" tab: completed + cancelled appointments, filterable by a cycle-year chip selector. Cards now also show the actual fitness outcome/remarks or cancellation reason for History entries — previously `renderCard` showed only a status badge, which would have made a History tab useless on its own.

**Other fixes:**
- Caught while checking for leftover references to the renamed tab: after scheduling a new appointment, the screen jumped to the now-nonexistent `'All'` tab key, which would have silently landed on a blank screen post-rename. Fixed to jump to `'Active'`.
- Both free-text "HH:MM" time fields (Schedule tab, reschedule-approve panel) switched to the existing `TimePickerField` component, same one built in Phase 9.
- `fitnessScheduler.js`'s daily reminder job now includes `reschedule_requested` in its eligible statuses — previously an employee with a pending reschedule request got no day-before/day-of reminder at all for the original slot, even though that slot is still what's technically booked until admin acts on the request.

**Files touched:** `app/src/screens/fitness/FitnessAdminScreen.js`; `functions/src/fitness/fitnessScheduler.js`.

---

## Pre-Launch Hardening — Day 25

Follows directly from Day 24's data wipe and real-account creation. Not a new phase — all 12 V1 phases stay closed — but real bugs and one real feature turned up during pre-launch verification of the two real admin accounts, so tracked here rather than left implicit.

**Admin signup-notification routing — fixed:** `authRoutes.js`'s `POST /register` had sent the new-signup admin notification to a single hardcoded string, `'admin@ffl.com'`, since it was written — not a real, checked inbox. Fixed to query all active `admin_incharge` accounts at send time and notify every one of them, as an array passed to the `mail` collection's `to` field. Scoped to `ADMIN_INCHARGE` only, not `CMO` — confirmed by checking `POST /approve-user`/`POST /reject-user`, which only `ADMIN_INCHARGE` can actually call; notifying a role that can't act on the request would just be noise. Guards against the (currently impossible, but worth having) case of zero active admins by logging a warning instead of silently sending nowhere.

**SMTP delivery — root cause found and fixed, genuinely verified working:** testing the routing fix above surfaced that email delivery itself was broken — every attempt failed with `535-5.7.8 Username and Password not accepted`. Two hypotheses were tried in order:
- **First hypothesis (wrong, but worth recording so it isn't re-tried):** the SMTP connection URI embedded the sending Gmail address unencoded (`homi55@gmail.com` inside a `user:pass@host` URL, which itself contains an `@`). Percent-encoded to `homi55%40gmail.com` and redeployed — did not fix it. Ruled out cleanly: same error, same account, after the change.
- **Actual root cause:** the app password in the URI had never existed in Google's system — confirmed directly via the account's own "App Passwords" page, which showed zero passwords ever created. 2-Step Verification was independently confirmed ON (since 2019), ruling that out as a contributing factor. A fresh App Password was generated and swapped in.
- **Verified fixed, not just assumed** — confirmed at three separate levels on a real test signup: the `mail` document's `delivery.state` read `SUCCESS` with `error: null`; Gmail's own `info.accepted` listed both admin addresses; and the actual email was found sitting in both real inboxes (`homi55@gmail.com` directly, `humayun.shahzad@fatima-group.com` via a phone screenshot).
- **Takeaway worth keeping:** this exact symptom (535 auth rejected) will look identical if the app password is ever revoked or regenerated in the future. Check the account's App Passwords list first before suspecting anything else.

**New feature — duplicate house/room number warning on Pending Approvals:** built after Homi found 4 of his own test accounts had accidentally shared one house number, with nothing in the system to catch it. Deliberately informational, never blocking — a shared address is often legitimate (e.g. a married couple who are both employees, sharing one company house), so this is a judgment aid for the admin at approval time, not a hard rule. Design locked before building, two decisions confirmed directly with Homi: checks **both** `houseNumber` (family residents) and `roomNumber` (bachelor residents); matches against **any** other employee record regardless of status (active, disabled, or still pending) — resolved to a single query against the `employees` collection itself, since a doc only ever disappears via Reject, so every remaining doc is a real, current record of some status. `GET /pending-users` now returns `houseNumber`/`roomNumber`/`duplicateAddressMatches` (each match's name, employee number, and resolved status) per pending signup; `UserApprovalScreen.js` shows a red "⚠️ Address match" badge on the card plus a detail box listing every match when expanded. **Live-verified working correctly**, including a state-transition case not originally planned for: after approving one of two colliding pending signups, the *other* still-pending one correctly kept showing the warning against the now-active account — confirming the check genuinely spans all three statuses, not just a snapshot at query time. (One earlier round of testing appeared to show the badge failing to fire; root-caused to the test accounts already being approved and no longer in the pending pool by the time they were inspected — not a code bug. Worth remembering for future testing of this feature: it can only be observed on genuinely still-pending accounts.)

**SignupScreen branding — logo swapped, centered, enlarged:** header's placeholder "FFL / MEDICAL CENTRE" text badge replaced with the real `FFCL_Logo.png` asset (`app/assets/FFCL_Logo.png`), sized up from 48×48 to 100×100, `resizeMode="contain"` so it can't distort. Back button moved to an absolutely-positioned top-left element so it no longer occupies row space and blocks the logo from truly centering. `borderRadius` deliberately dropped from the old style — it existed to crop a solid color box, and would risk clipping a real logo asset unless confirmed square. Scope confirmed explicitly limited to this one screen (not Login or any other header) — the block sits outside the 3-step conditionals, so one edit covers all 3 signup steps without duplication. **Not yet checked:** the logo file itself is 478 KB per the last hosting deploy log — likely an oversized/uncompressed source image being scaled down at display time, not actually broken, but worth compressing before Play Store submission for load-time reasons.

**Files touched this session:** `functions/src/auth/authRoutes.js` (admin notification routing, `GET /pending-users` duplicate-address check); `app/src/screens/admin/UserApprovalScreen.js` (duplicate-address badge + detail box); `app/src/screens/auth/SignupScreen.js` (logo swap/center/enlarge). SMTP fix was Firebase Console configuration only (Trigger Email extension), no code touched.

**Test accounts created during this session's live verification — pending cleanup, not yet done:**
- Multiple rounds of duplicate-house-number test signups (various `FFL-00102`–`FFL-00106`-range employee numbers, `homi55.home@gmail.com`/`homitvaccouny@gmail.com`/`homisumaira@gmail.com`/`homi5@msn.com` and similar) — mix of approved-and-active and still-pending at time of writing; all need review and removal before launch, not just the ones still marked pending.
- `homi55@gmail.com` itself — explicitly noted as a temporary admin account created only to test the Gmail-domain delivery path; per Homi's own earlier statement, this should be cleaned up once no longer needed for testing, not carried into launch as a real admin account.
- Two genuinely-intended-to-stay accounts, not for cleanup: `humayun.shahzad@fatima-group.com` (FFL-00100, real `admin_incharge`) — this is Homi's real production account.

---

## Design decisions — CLOSED, unchanged
- [x] Header/logout layout — driver accepted as intentional one-off
- [x] Employee pink tiles vs. white — kept as-is per Homi's stated priority (employee = actual customer, gets design investment)

## Process notes
- Before opening a new phase, re-run a fresh live test of the previous phase's fixes to confirm nothing regressed — held throughout Phases 1–4
- One issue at a time, full verification after each
- Complete file replacements over partial edits remains the default; surgical edits only for genuinely minor single-line changes
- **Added Day 14:** live-testing in rounds (build → test → fix → re-test) surfaced real bugs at every round in Phase 4, including a security issue in round 3 that wouldn't have been caught by code review alone — this round-based testing discipline is worth keeping for future phases, not just Phase 4
- **Added Day 25:** when a live test appears to show a fix not working, check whether the test setup itself is still valid (e.g. test data already approved/moved out of the state being checked) before assuming the code is wrong — cost real back-and-forth this session on the duplicate-address feature, which turned out to be working correctly the whole time.

## Explicitly out of scope for V1
- **Vaccination flow (full — catch-up, adult, nurse-driven).** As of Day 24 pre-launch review: **deliberately left unreviewed**, not overlooked — Homi's explicit call to hold this module out of every V1 review pass, including the `isActive`-enforcement audit (see Phase 10 entry) and the pre-launch data wipe (see below). Its current Firestore data (`vaccinationRecords`, `vaccinationReports`, `vaccineSchedule`) is treated the same as every other module's test data for wipe purposes, despite `vaccineSchedule` looking structural/config-like — none of it is being carried forward as real launch data. Whatever exists here at V2 kickoff should be treated as needing its own full review from scratch, not assumed current or trustworthy.
- Nurse, lab_technologist, pharmacy_incharge full flows
- Non-entitled resident relatives flow (logged to V2 backlog, enriched Day 14 with relation types and field list)
- Homecare Medical Services Requirement (logged to V2 backlog Day 14, concept only)
- Any other new module or idea raised during this review, however small

## Other pending
- ~~Notification debugging — deferred to final pre-production testing round.~~ **Resolved Day 24**, ahead of the pre-production round it was originally deferred to: audited all notification-sending code paths and found one real, silent bug — `tripScheduler.js`'s trip-day reminder wrote notifications in an old field schema (`targetEmployeeId` etc.) that predated the flat `recipientUid`/`type`/`isRead` shape every other notification write uses. `GET /my` filters on `recipientUid`, which those documents never had — the reminder had been silently failing to reach any employee since the scheduler was written, despite logging success. Fixed to match the standard schema. All other notification-sending code paths (Ambulance, Trip booking/confirm/cancel, Fitness scheduling + daily reminders, Circulars) confirmed correctly built. `availabilityScheduler.js` confirmed to intentionally send none. Phases 10, 11, and 12 all now closed (Day 24) — the full original "after Phases 10–12" trio is done.
- ~~Pre-launch Firestore data wipe~~ — **complete as of Day 24**: all collections cleared except `config/dropdowns` (required) and the surviving admin account, per plan. Two real employee accounts then created specifically to give SMTP a genuine test — see Day 25 Pre-Launch Hardening section above for how that test actually went (found and fixed a real, previously-undiscovered SMTP failure, not just confirmed the earlier "dummy email" theory).
- **Test-account cleanup** — new, Day 25. Several rounds of duplicate-house-number and SMTP-delivery test accounts now exist in live Firestore/Auth from this session's verification work. Full list in the Day 25 Pre-Launch Hardening section above. Needs a dedicated cleanup pass before launch, same as the Day 24 wipe — not yet scheduled.
- **`FFCL_Logo.png` file size** — new, Day 25. 478 KB, confirmed from a real hosting deploy log — large for a header icon rendered at 100×100. Not broken, just worth compressing before Play Store submission.
- **Firebase Extensions deprecation notice** — new, Day 25, noticed while fixing the SMTP config. Google states Firebase Extensions (which the Trigger Email extension the whole notification system depends on) will shut down March 31, 2027, with migration guidance promised "September 2026." Over a year out, not urgent, but the entire admin-notification-email system runs through this extension — worth a placeholder line on the long-term backlog so it isn't a surprise later. A "new version available" prompt on the same extension screen was deliberately left un-clicked this session, right after finally getting the current version working — revisit deliberately, not as a side effect of another fix.
- **`firebase-functions` package outdated** — noticed in deploy logs across this session, not yet acted on. `npm install --save firebase-functions@latest` inside `functions/`, then redeploy to confirm nothing breaks. Low priority, just a nag warning, not a failure.

## Important Commands

# Tree Structure Command
tree -L 5 -I 'node_modules|dist|.git|.expo|.agents'

# backup command
bash scripts/backup.sh

# web build command
cd /mnt/storage/projects/ffl-medical-centre/app
rm -rf dist
npx expo export --platform web
cd /mnt/storage/projects/ffl-medical-centre
firebase deploy --only hosting

# Functions Deploy — full, safe default when unsure which function group a file belongs to
cd /mnt/storage/projects/ffl-medical-centre/functions
firebase deploy --only functions

# Functions Deploy — narrower, only when certain of the target
# (confirmed Day 25 via a real deploy log: authRoutes.js lives under the
# `auth` function, NOT `employees` — the two are separate Cloud Functions.
# Guessing wrong here silently ships nothing.)
firebase deploy --only functions:auth
firebase deploy --only functions:employees

# Firestore rules deploy (separate from the above — easy to forget)
cd /mnt/storage/projects/ffl-medical-centre
firebase deploy --only firestore:rules