# FFL Medical Centre — Command Board

Quick reference for daily work. For locked flow status, architecture, and decisions, see FFL_Medical_Centre_Master_Design.md instead — this file does not duplicate that content. For the full pre-production audit findings, see docs/DAY10_AUDIT_FINDINGS.md. For the full Phase 4 (My Profile) design — every decision, field ownership rule, and state machine — see docs/PHASE4_DESIGN.md; this file only summarizes what shipped.

**Note on this revision (Day 14):** Phases 3 and 4 are now closed. Phase 4 in particular grew far beyond its original 5-step scope during live testing — a second round of fixes (7 issues) and a third round found during final review (3 more, including a real security bug) were folded in before closing it. See the Phase 4 entry below for the full shape of what actually shipped versus what was originally planned.

**Note on this revision (Day 15):** Phase 5 (Ambulance) grew the same way Phase 4 did — started as a gap/bug audit, ended as a near-total redesign after live testing surfaced real bugs and a full design discussion reshaped the operational model. Design is locked in `docs/PHASE5_DESIGN.md`, build sequence is broken into subphases 5.1–5.8 below. Locked but flexible — on-the-go improvements can be incorporated as build progresses; pending open items are deferred to time of need, not blocking the sequence.

**Note on this revision (Day 21):** Phase 5 is now closed — all subphases 5.1–5.9 (including 5.8's three sub-parts) built and live-verified across reception, Doctor, and CMO logins. 5.7 was deliberately decided not to be built, not missed — see the Phase 5 entry below and `docs/PHASE5_DESIGN.md` for the reasoning. Every item on the original "Still Open" list is now resolved one way or another.

**Note on this revision (Day 21, cont'd):** Phase 6 (Doctor Availability) is now closed. Like Phases 4 and 5, it grew from a standard gap/bug audit into real feature work once live testing surfaced actual bugs and a design conversation added a genuine new capability (leave scheduling) mid-phase. Full detail in the Phase 6 entry below.

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
| Report frontend screens | "Backend done, frontend pending" | **Built** — 7 report screens exist, matching 7 backend endpoints (correctness not yet verified — see Phase 10) |
| My Profile (employee self-service fields) | "Confirmed missing on both employee and admin side" | **Built and closed Day 14** — see Phase 4 |

---

## Way Forward — V1 Completion (Phases 1–10)

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

### Phase 6 — Doctor Availability review
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

### Phase 7 — Doctor Directory review
- [ ] Not yet reviewed this session — audit screens + backend routes for gaps/bugs within scope

### Phase 8 — Notices & Circulars review
- [ ] Not yet reviewed this session — audit screens + backend routes for gaps/bugs within scope

### Phase 9 — Patient Feedback review
- [ ] Confirmed bug (found Day 13): `reportRoutes.js`'s `/feedback` route reads field names that don't match the real schema (`ratings.staffBehaviour`, `ratings.housekeeping`, `ratings.waitingTime`, `suggestion` vs. what the route reads). Same shape of bug as the Phase 1 Fitness report fix. Feedback averages/report have likely never shown correct data.
- [ ] Screens (`FeedbackDetailScreen.js`, `FeedbackFormScreen.js`, `FeedbackListScreen.js`) not yet reviewed — audit for further gaps/bugs within scope

### Phase 10 — Reports review
- [ ] Run all 7 report screens post Phase 2/3/4 fixes and confirm each returns correct live data — now includes checking whether any report should reflect the new My Profile fields (department/designation/blood group are now reliably populated where they weren't before)
- [ ] 5 `reportRoutes.js` routes with no frontend tile (`/fitness`, `/ambulance`, `/trips`, `/vaccination`, `/feedback`) — decide build-vs-remove per route (Fitness/Ambulance/Feedback in-scope, Vaccination is V2)
- [ ] Assess requirement for any new reports, remaining within scope
- [ ] Deliberately held until after Phase 4 (now closed) so reports can be reviewed against the complete employee data model

---

## Design decisions — CLOSED, unchanged
- [x] Header/logout layout — driver accepted as intentional one-off
- [x] Employee pink tiles vs. white — kept as-is per Homi's stated priority (employee = actual customer, gets design investment)

## Process notes
- Before opening a new phase, re-run a fresh live test of the previous phase's fixes to confirm nothing regressed — held throughout Phases 1–4
- One issue at a time, full verification after each
- Complete file replacements over partial edits remains the default; surgical edits only for genuinely minor single-line changes
- **Added Day 14:** live-testing in rounds (build → test → fix → re-test) surfaced real bugs at every round in Phase 4, including a security issue in round 3 that wouldn't have been caught by code review alone — this round-based testing discipline is worth keeping for future phases, not just Phase 4

## Explicitly out of scope for V1
- Vaccination flow (full — catch-up, adult, nurse-driven)
- Nurse, lab_technologist, pharmacy_incharge full flows
- Non-entitled resident relatives flow (logged to V2 backlog, enriched Day 14 with relation types and field list)
- Homecare Medical Services Requirement (logged to V2 backlog Day 14, concept only)
- Any other new module or idea raised during this review, however small

## Other pending (unchanged from before)
- Notification debugging — deferred to final pre-production testing round, after Phase 10

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

# Functions Deploy
cd /mnt/storage/projects/ffl-medical-centre/functions
firebase deploy --only functions:employees

# Firestore rules deploy (separate from the above — easy to forget)
cd /mnt/storage/projects/ffl-medical-centre
firebase deploy --only firestore:rules