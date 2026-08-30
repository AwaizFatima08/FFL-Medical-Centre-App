# FFL Medical Centre — Command Board

Quick reference for daily work. For locked flow status, architecture, and decisions, see FFL_Medical_Centre_Master_Design.md instead — this file does not duplicate that content. For the full pre-production audit findings, see docs/DAY10_AUDIT_FINDINGS.md.

**Note on this revision (Day 13):** After a 3-month gap in active work, this file was found significantly out of date — items marked "not yet built" were confirmed complete, and several undiscovered bugs surfaced during a full-repo + live-Firestore review. This revision replaces prior Open Items entirely with a numbered phase structure covering the rest of V1, rather than patching the old session-log format further.

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

---

## Scope for V1 completion (locked, Day 13)

**In scope — 10 confirmed modules:**
User signup & validation, Family flow, Ambulance flow, Medical trip, Doctor availability, Doctor directory, Blood donor database, Notices & circulars, Patient feedback, Fitness scheduling. Reports is a cross-cutting view over these, not a separate module.

**Explicitly deferred to V2 — no exceptions:**
Vaccination flow, Lab module, Store/Pharmacy module, and any new idea or module raised during this review. Enhancements to the 10 in-scope modules found while evaluating them for gaps remain in scope; anything outside them does not.

**Standing decision:** No rushed publish. First public release should be impactful — quality over speed.

---

## Confirmed Feature Status (Day 13 correction)

Prior versions of this file were wrong about the following, corrected via live file + Firestore review:

| Feature | Prior status said | Actual status |
|---|---|---|
| Family module | "Not yet built (V1 scope)" | **Built and functional** — 4 screens, full pending-revision approval flow, backend routes live |
| Report frontend screens | "Backend done, frontend pending" | **Built** — 7 report screens exist, matching 7 backend endpoints (correctness not yet verified — see Phase 10) |
| My Profile (employee self-service fields) | Not previously tracked as a gap | **Confirmed missing on both employee and admin side** — see Phase 4 |

---

## Way Forward — V1 Completion (Phases 1–10)

### Phase 1 — Confirmed live bugs — **CLOSED Day 13**
- [x] Residence Type split by branch (family vs bachelor) + bachelor question reworded to "Are you living in township bachelor accommodation?" — closed, tested, confirmed on both branches
- [x] Blood Donor Directory blocks admin & employee — role array in `blood-donors/:bloodGroup` route expanded to all 9 roles — closed, tested (manual `bloodDonorRegistry` test doc), confirmed both name/employee-number/phone displaying correctly
- [x] Blood Donor Directory missing employee number — added to write in both `employeeRoutes.js` (`PUT /:employeeId`) and `authRoutes.js` (`POST /complete-profile`, a second write path to the same collection, found and fixed in the same pass) and to read (`blood-donors` route) — closed, tested
- [x] ESB designation dropdown returns empty list — case mismatch fixed in both `app/src/constants.js` and `functions/src/constants.js` (`EMPLOYEE_TYPES.ESB` aligned to live `'ESB'`, `getDesignationsByType` now case-insensitive) — applied, **pending live verification at Phase 4** since no screen calls this function yet
- [x] Fitness report always shows zero for fit/unfit/conditional — `reportRoutes.js` `/fitness` route now reads `fitnessOutcome` (confirmed via `FitnessAdminScreen.js`'s `OUTCOME_OPTIONS` as source of truth); third bucket renamed `conditional` → `fit_with_restrictions` to match the real value — closed. No frontend currently consumes this endpoint's response (see Phase 10 note below), so the rename carries no regression risk today.

### Phase 2 — Trip reports structural fix — **CLOSED Day 13**
- [x] Confirmed root cause: `reportRoutes.js` queried a `medicalTrips` collection (with `bookings` subcollection) that does not exist in live Firestore. Real data is flat, top-level `tripBookings`.
- [x] Rewrote `/trip-day`, `/trips/monthly`, `/trips` to query `tripBookings` directly
- [x] Added `getHospitalMap` helper — batched `doctorId` → `doctorDirectory.hospital` lookup (`tripBookings` has no stored `hospital` field)
- [x] Found and fixed two additional bugs during the rewrite: seat counting summed booking count instead of `seats` field; status filter compared against `BOOKING_STATUS.APPROVED` (`'approved'`), a value that never appears in live data (real value is `'confirmed'`)
- [x] `MEDICAL_TRIP_TOTAL_SEATS` (26, from constants) now used instead of a dead `tripData.totalSeats` fallback
- [x] Fixed PDF phone field (`b.phone`, not the nonexistent `employeePhoneNumber`)
- [x] Required a new Firestore composite index (`tripBookings`: `status` + `tripDate`) — created and confirmed enabled; `functions/firestore.indexes.json` re-exported and now accurately reflects all 19 live indexes (was previously a stale partial file)
- [x] **Verified live:** Monthly Trip Report for May 2026 returned 3 real bookings, correctly enriched with hospital via lookup (RYK Hospital, Fatima Memorial Hospital), including one row correctly showing `—` where the referenced doctor has no hospital on file — confirms the fallback behaves correctly on incomplete data, not a bug
- [ ] **Not yet live-verified:** Trip Day Report (no same-day confirmed booking existed to test against) and the general `/trips` route (not wired to any frontend screen currently). Both share the same query pattern and helper functions as the verified Monthly Trip Report, so risk is low, but flagging as unverified rather than assuming pass-by-association.

### Phase 3 — Code-only consistency fixes
*(No data migration needed — all current employee records are test data, to be wiped before launch. These are forward-looking code corrections only.)*
- [ ] Marital status: `constants.js` uses `'single'`; live config + schema use `'unmarried'` — align code to live config
- [ ] Department/unit casing: `constants.js` fallback uses `Production_N` style; live config uses `Production_n` style — align code to live config
- [ ] Designation code drift (low priority): `constants.js` missing `Senior_Engineer_M9A`; GTE rank naming inconsistent across sources — only matters if live-config fetch fails and fallback is used

### Phase 4 — My Profile (new feature)
Root cause: backend (`PUT /:employeeId`) and config/dropdowns were built ahead of any frontend. Confirmed: **neither an employee-facing nor an admin-facing screen exists** for department, unit, designation, blood group, CNIC, blood donor consent, or chronic disease — this is a full gap on both sides, not a partial one.

Needs two screens:
- Employee-facing: submit/edit these fields, routed through admin review (reuse `familyMembers` pending-revision pattern)
- Admin-facing: review/approve/correct submitted values (equivalent of `FamilyAdminReviewScreen.js` for employee fields)

Build order (each fully verified before the next):
1. Department → Unit → Designation (cascading dropdowns)
2. Blood group + CNIC (admin-verified)
3. Blood donor consent (employee + family) — feeds the Phase 1-fixed directory
4. Chronic disease (employee + family, admin/CMO-visible only)
5. Picture upload (own sub-session — camera/gallery/Storage work)

**Not started until Phase 1–3 are stable and verified**, per no-rushed-publish decision.

### Phase 5 — Ambulance flow review
- [ ] Not yet reviewed this session — audit screens + backend routes for gaps/bugs within scope

### Phase 6 — Doctor Availability review
- [ ] Not yet reviewed this session — audit screens + backend routes for gaps/bugs within scope

### Phase 7 — Doctor Directory review
- [ ] Not yet reviewed this session — audit screens + backend routes for gaps/bugs within scope

### Phase 8 — Notices & Circulars review
- [ ] Not yet reviewed this session — audit screens + backend routes for gaps/bugs within scope

### Phase 9 — Patient Feedback review
- [ ] Confirmed bug (found during schema doc correction, Day 13): `reportRoutes.js`'s `/feedback` route reads `staffBehaviourRating`, `cleanlinessRating`, `servicesRating`, `comments` — none of these match the real field names (`ratings.staffBehaviour`, `ratings.housekeeping`, `ratings.waitingTime`, `suggestion`). Same shape of bug as the Phase 1 Fitness report fix. Feedback averages/report have likely never shown correct data.
- [ ] Screens (`FeedbackDetailScreen.js`, `FeedbackFormScreen.js`, `FeedbackListScreen.js`) not yet reviewed this session — audit for further gaps/bugs within scope

### Phase 10 — Reports review
- [ ] Run all 7 report screens (Trip Day, Monthly Trip, Township Population, Non-Township, Employee-Only, Blood Group, Ambulance KPI) post Phase 2/3 fixes and confirm each returns correct live data
- [ ] **New finding (Day 13, surfaced while fixing the Fitness report bug):** `reportRoutes.js` has 5 routes with no corresponding tile in `ReportsHubScreen.js` and no dedicated screen anywhere in `reports/` — `/fitness`, `/ambulance`, `/trips` (the one querying the non-existent `medicalTrips`, distinct from the working `/trip-day` and `/trips/monthly` routes), `/vaccination`, `/feedback`. Unclear whether these are: (a) built ahead of frontend, same pattern as My Profile and the Feedback field-name bug, or (b) legacy/dead code from before the Reports Hub was restructured. Needs a deliberate decision — build the missing screens (if in-scope: Fitness, Ambulance, Feedback all are; Vaccination is V2), or remove the dead routes — rather than leaving them unexplained.
- [ ] Assess requirement for any new reports, remaining within scope
- [ ] Deliberately held until after Phase 4 so reports can be reviewed against the complete employee data model (post My Profile), not re-checked twice

---

## Design decisions — CLOSED, unchanged
- [x] Header/logout layout — driver accepted as intentional one-off
- [x] Employee pink tiles vs. white — kept as-is per Homi's stated priority (employee = actual customer, gets design investment)

## Process notes
- Before Phase 2 opens, re-run a fresh live A–Z signup test to confirm Phase 1 fixes behave as expected and haven't introduced anything new
- One issue at a time, full verification after each — confirmed working again on the Phase 1 residence-type fix (Day 13)
- Complete file replacements over partial edits remains the default; surgical edits only for genuinely minor single-line changes

## Explicitly out of scope for V1
- Vaccination flow (full — catch-up, adult, nurse-driven)
- Nurse, lab_technologist, pharmacy_incharge full flows
- Any new module or idea raised during this review, however small

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