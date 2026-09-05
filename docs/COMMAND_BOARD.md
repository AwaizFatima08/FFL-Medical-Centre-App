# FFL Medical Centre — Command Board

Quick reference for daily work. For locked flow status, architecture, and decisions, see FFL_Medical_Centre_Master_Design.md instead — this file does not duplicate that content. For the full pre-production audit findings, see docs/DAY10_AUDIT_FINDINGS.md. For the full Phase 4 (My Profile) design — every decision, field ownership rule, and state machine — see docs/PHASE4_DESIGN.md; this file only summarizes what shipped.

**Note on this revision (Day 14):** Phases 3 and 4 are now closed. Phase 4 in particular grew far beyond its original 5-step scope during live testing — a second round of fixes (7 issues) and a third round found during final review (3 more, including a real security bug) were folded in before closing it. See the Phase 4 entry below for the full shape of what actually shipped versus what was originally planned.

**Note on this revision (Day 15):** Phase 5 (Ambulance) grew the same way Phase 4 did — started as a gap/bug audit, ended as a near-total redesign after live testing surfaced real bugs and a full design discussion reshaped the operational model. Design is locked in `docs/PHASE5_DESIGN.md`, build sequence is broken into subphases 5.1–5.8 below. Locked but flexible — on-the-go improvements can be incorporated as build progresses; pending open items are deferred to time of need, not blocking the sequence.

**Note on this revision (Day 21):** Phase 5 is now closed — all subphases 5.1–5.9 (including 5.8's three sub-parts) built and live-verified across reception, Doctor, and CMO logins. 5.7 was deliberately decided not to be built, not missed — see the Phase 5 entry below and `docs/PHASE5_DESIGN.md` for the reasoning. Every item on the original "Still Open" list is now resolved one way or another.

**Note on this revision (Day 21, cont'd):** Phase 6 (Doctor Availability) is now closed. Like Phases 4 and 5, it grew from a standard gap/bug audit into real feature work once live testing surfaced actual bugs and a design conversation added a genuine new capability (leave scheduling) mid-phase. Full detail in the Phase 6 entry below.

**Note on this revision (Day 21, cont'd):** Phase 7 (Doctor Directory) is now closed — small, contained review as expected, one data typo fixed, admin-only write access confirmed intentional. Phase 8 (Notices & Circulars) is now closed — surfaced a real Storage rules gap (any authenticated user could write directly to Storage regardless of the app's role-gated buttons), fixed and live-verified. Full detail in the Phase 7 and Phase 8 entries below.

**Note on this revision (Day 21, cont'd):** Phase 9 (Patient Feedback) is now closed — started as the Day-13-flagged report bug, grew into a substantial feature phase: two new lightweight provider roles (Dentist/Physiotherapist), admin's feedback access removed entirely for privacy reasons, and a new standalone Suggestions feature built end-to-end. Fully live-verified from employee, CMO, and admin logins. Full detail in the Phase 9 entry below. Remaining backlog going into next session: Medical Trip (Phase 11 — never had its own review phase), Fitness Scheduling (Phase 12), and Reports (Phase 10, already scoped below).

**Note on this revision (Day 22):** Phase 11 (Medical Trip) and Phase 12 (Fitness Scheduling) are both now closed. Phase 11 started as the standard write-side gap audit and grew substantially once live testing began — a real family-linked patient-selection redesign, a reception cancellation-reason feature, a Rahimyarkhan-only doctor restriction, and a genuine mid-build mistake (wrongly assuming `familyMembers` was a subcollection) caught and corrected via live data. Phase 12 stayed small and contained as expected — one real gap (no history view for admin/CMO/doctor) plus a few small polish items. Full detail in each phase's entry below. Also fixed at the very start of this session, before Phase 11 began: the `purposeOfVisit` bug flagged during Phase 9's wrap-up (tracked only in Schema Reference at the time, not listed under Phase 9 above since it surfaced after that phase's own closing) — see the addendum under Phase 9. Only Phase 10 (Reports) remains before the full V1 module set has been through a dedicated review pass.

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

### Phase 10 — Reports review
- [ ] Run all 7 report screens post Phase 2/3/4 fixes and confirm each returns correct live data — now includes checking whether any report should reflect the new My Profile fields (department/designation/blood group are now reliably populated where they weren't before)
- [ ] 5 `reportRoutes.js` routes with no frontend tile (`/fitness`, `/ambulance`, `/trips`, `/vaccination`, `/feedback`) — decide build-vs-remove per route (Fitness/Ambulance/Feedback in-scope, Vaccination is V2)
- [ ] `/feedback` route was fixed in Phase 9 (field names + role list) but has no frontend screen yet — build one against the corrected response shape (no `anonymous`, includes `waitingTime`) rather than the old broken shape
- [ ] Assess requirement for any new reports, remaining within scope
- [ ] Deliberately held until after Phase 4 (now closed) so reports can be reviewed against the complete employee data model

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
- Notification debugging — deferred to final pre-production testing round. Phases 11 and 12 now closed (Day 22); Phase 10 is the only one left of the original "after Phases 10–12" trio.

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