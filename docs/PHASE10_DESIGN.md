# Phase 10 — Reports Module: Design Document

Companion to `COMMAND_BOARD.md`'s Phase 10 entry, same relationship `PHASE4_DESIGN.md` and `PHASE5_DESIGN.md` have to their phases. This file is the full record of every decision made while speccing the Reports module — every locked field, every rejected alternative, every open question. The Command Board only summarizes what shipped; this is where the "why" lives.

**Status: CLOSED Day 24.** All 10 reports built and live-verified; Homi reviewed every report across two separate passes and confirmed each one working. This file's original Day 23 content (spec session — every locked field, filter, and open question) is preserved below unchanged. A new section, **"Build session (Day 24)"**, has been added after the report specs — it documents what actually happened once building started: bugs found, decisions made, deviations from spec, and the cross-cutting employee-deactivation work that grew out of Blood Donor Report. The "Open items carried into the next session" section at the bottom has been resolved in place, each item updated with its actual outcome rather than left as a stale open question.

---

## Session structure

This phase was deliberately held until last, after every other module's own review phase closed — the explicit reasoning being that reports need to be reviewed against live data produced by the *other* fixed modules, not against assumptions. That paid off directly: reviewing Ambulance KPI Report surfaced that `falseEmergencyFlag` already existed live but was undocumented; reviewing Employee Report surfaced the `dateOfBirth` capture bug; reviewing Population Report surfaced that `gender` had never been captured anywhere at all.

Two real, from-scratch bugs were found and fixed mid-session, entirely because reports work forced a fresh look at fields other modules had never needed to touch. Both are documented in full below before the report specs, since several reports depend on them.

---

## Bug fixes (both closed and live-verified this session)

### Fix 1 — `dateOfBirth` silently dropped at employee signup

**Found while:** speccing Employee Report's requested `DOB` column and cross-checking it against live Firestore data.

**Root cause:** `SignupScreen.js` has always collected Date of Birth at Step 2 and sent it in the `POST /register` request body. `authRoutes.js`'s `/register` handler never destructured or wrote it — identical shape to the `purposeOfVisit` (Feedback, Day 21) and `hospital` (Trip Booking, Phase 11) bugs already on record. Confirmed by reading both files side by side, not by inference.

**Fix:** `authRoutes.js`'s `/register` now destructures `dateOfBirth`, requires it (400 if missing — same treatment as `cnic`/`maritalStatus`/`isSmoker`), validates the incoming `"YYYY-MM-DD"` string parses to a real date, and converts it to a Firestore Timestamp via `admin.firestore.Timestamp.fromDate()` before writing — matching `familyMembers.dateOfBirth`'s existing type, rather than leaving `employees.dateOfBirth` as a raw string (a mismatch that would have complicated any future code trying to treat both the same way).

**Verified live:** new test signup (`Tanvver Aslam`, `FFL-00009`) shows `dateOfBirth: October 1, 1985` as a real Firestore Timestamp.

**Known cosmetic gap, not a bug:** the new fix stores UTC midnight (which lands at 05:00 Pakistan time), while `familyMembers.dateOfBirth` stores local midnight. Since Pakistan's UTC+5 offset never pushes a UTC-midnight timestamp into the previous or next calendar day, this cannot cause an off-by-one-day error — purely a difference in stored time-of-day between the two collections. Not worth fixing unless byte-for-byte consistency between the two collections is wanted for its own sake.

**Permanent data gap:** every employee who signed up before this fix has no recoverable `dateOfBirth` — there is no source to backfill from (unlike `hospital`, which could fall back to a `doctorDirectory` lookup). Homi's call: acceptable, since all current data is test data slated for deletion before launch.

**Files touched:** `functions/src/auth/authRoutes.js`.

---

### Fix 2 — `gender` never captured anywhere, for employees or family members

**Found while:** speccing Population Report figure 8 (male/female population breakdown).

**Root cause — genuinely different from Fix 1:** this was not a silent-drop bug. No employee or family-member record has ever had a `gender` field, on any collection, at any point in this project's history. The one place that looked like existing support — `employeeRoutes.js`'s `POST /:employeeId/family-members` already destructuring a `gender` param — turned out to be irrelevant: that route is dead code (per the Phase 11 Command Board finding that `familyMembers` is a top-level collection, not a subcollection under `employees/{id}`, and nothing calls those subcollection routes). `FamilyMemberAddScreen.js` and `FamilyMemberEditScreen.js` write directly to Firestore and never called that route at all.

**Fix — seven files, all closing the same gap from both directions (employee + family member) and both angles (create + edit):**

| File | Change |
|---|---|
| `app/src/constants.js` | New `GENDERS = ['male', 'female']`, alongside `MARITAL_STATUSES` |
| `app/src/screens/auth/SignupScreen.js` | Gender field added to Step 2, required |
| `functions/src/auth/authRoutes.js` | `/register` requires + stores `gender` |
| `functions/src/employees/employeeRoutes.js` | `gender` added to `PUT /:employeeId` as self-editable — same treatment as `maritalStatus`/`isSmoker`, never locked like `cnic` |
| `app/src/screens/profile/MyProfileScreen.js` | New "Gender" section, self-edit, mirrors the existing Marital Status picker exactly |
| `app/src/screens/family/FamilyMemberAddScreen.js` | Gender field added to the add form, required |
| `app/src/screens/family/FamilyMemberEditScreen.js` | Gender field added, routed through `pendingRevision` (admin review) — **not** a direct write like blood donor consent, since gender is identity data like name/DOB/CNIC/blood group on this screen |

**Design decision — self-editable, not locked:** unlike `cnic` (locked after signup, admin-owned), `gender` follows the `maritalStatus` pattern: always self-editable by the employee via `PUT /:employeeId`, no admin approval gate. Homi's explicit call.

**Design decision — family member edits go through review, employee edits don't:** on `MyProfileScreen.js`, gender is a direct self-service write (same as marital status). On `FamilyMemberEditScreen.js`, it's routed through `pendingRevision` alongside the other identity fields on that screen (name, DOB, CNIC, blood group) — consistent with how that screen already treats every field except blood donor consent, which is deliberately a direct write per Phase 4's design.

**Verified live:** full round-trip tested — new signup with Gender set, My Profile Gender section displaying and updating correctly, new family member added with Gender, that family member's Gender edited and confirmed to land in `pendingRevision` rather than going live immediately.

**Permanent data gap:** same as Fix 1 — pre-fix employees and family members have no `gender` value and no way to backfill it. Acceptable per the same test-data reasoning.

**Files touched:** all seven listed above.

**Documentation note for `SCHEMA_REFERENCE.md`:** both `employees.dateOfBirth` (timestamp) and `employees.gender` / `familyMembers.gender` (string, `"male"`/`"female"`) should be added to that doc's field tables — neither exists there yet.

---

## Report specs

Ten reports total: three redesigns/merges of existing screens, seven entirely new. All ten follow the universal rules established at the start of this session unless a report's own spec explicitly overrides one:

- **Tabular format**, column headings on top, *unless* a report's own spec calls for a tiled/summary-card layout instead (Population Report, Feedback Report — see their entries).
- **PDF export** on every report.
- **Access defaults to CMO**; wider access only where a report's spec explicitly says so.

---

### 1. Trip Day Report

*Redesign of the existing `TripDayReportScreen.js`.*

**Columns (10):** patientName, employeeName, employeeNumber, relation (`patientRelation`), houseNumber (`pickupHouse`), employeePhoneNumber, visitingDoctor (`doctorName`), Hospital (`hospital`), Referral (Yes/No), Return (Yes/No — "No" implies the patient is staying overnight; there is no separate overnight field, it's the inverse of Return).

**Date scope:** any single date, past or future, unlimited range in either direction. Future dates deliberately kept — real use case: a strike called with short notice lets reception pull tomorrow's bookings and call those employees to postpone. Blank state (not an error) if no bookings exist for the selected date, since trip days may expand beyond the current Mon/Wed/Sat schedule in future.

**Summary strip:** Confirmed / Total Seats / Available — stays on top, above the table.

**Filters (narrow within the selected day only):** employee number, employee name, visiting doctor, hospital.

**Access:** reception, admin_incharge, doctor, CMO.

---

### 2. Trip Range Report

*Replaces the existing `TripMonthlyReportScreen.js` entirely — not a variant, a full replacement with a different query shape (from/to date range instead of month+year picker).*

**Columns (8):** same as Trip Day Report minus houseNumber and employeePhoneNumber — a CMO reviewing a historical range doesn't need driver-logistics fields the way reception prepping tomorrow's trip does.

**Date scope:** from/to range, unlimited span, **past only** — no future dates (unlike Trip Day Report; there's no equivalent "plan ahead" use case for a range).

**No summary strip** — table only.

**No within-range filters** — this report's purpose is historical review, not day-to-day narrowing. (Cross-day/employee-history lookups belong here structurally, but no specific filter fields were requested.)

**Access:** CMO only.

**1600 finalize rule — explicitly dropped.** Was floated as "reports finalize at 1600 on trip day, snapshot needed for the printed driver PDF" — abandoned once Trip Day and Trip Range were split into single-day vs. range reports; no snapshot/lock logic exists or is needed. Live data only, always.

---

### 3. Ambulance KPI Report (Daily + Range)

*Redesign of the existing `AmbulanceKPIReportScreen.js`.*

**Columns (12) — identical set for both Daily and Range, unlike Trip Report's day/range split:**
patientName, employeeName (joined via `employeeNumber`), employeeNumber, relation (`patientRelation`), houseNumber (auto-locked from employee profile at request creation — see note below), natureOfVisit, responseTime, arrivalTime, returnTime, dropOff (Yes/No), tripRange, falseEmergencyFlag (Yes/No).

**Label mapping — adjusted to match schema values exactly, confirmed against live Firestore screenshots, not just the code:**
- `natureOfVisit` (replaces the old `priorityFlag` display): `emergency`→**Emergency**, `routine_consultation`→**Routine Consultation**, `physiotherapy`→**Physiotherapy**, `dental`→**Dental**, `lab_sample`→**Lab Sample**
- `tripRange`: `intra_township`→**Intra-Township**, `intercity`→**Intercity** (both adjusted to match schema style, not just the one that was ambiguous)
- `dropOff`: real stored field is `dropOffOutcome` with three values (`dropped_off`/`referred_outside`/`patient_declined`); collapsed for this report's display to Yes (`dropped_off`) / No (the other two). This is a display simplification only — the real 3-value field is untouched in the database and could be un-collapsed later without any new capture work.

**`falseEmergencyFlag` — already a fully built, live feature (Phase 5.8.3), not new work.** Confirmed via live Firestore screenshots: the field exists with a full audit trail (`falseEmergencyFlaggedAt`, `falseEmergencyFlaggedBy`). `SCHEMA_REFERENCE.md` is simply missing this field from its documented list — a doc gap, not a code gap, worth fixing next time that file is touched.

**`houseNumber` — new capture-flow change, not yet built:** currently a free-text field on the ambulance request form. Changing to **auto-lock from the employee's profile** — when an employee self-requests, pulled from their own profile; when reception requests on their behalf, pulled once the employee number is entered. Open implementation question, not yet resolved: should the resolved house number be **stored on the `ambulanceRequests` document at creation time** (recommended — same reasoning as the `hospital` snapshot fix, so a report pulled months later reflects the address at time of request, not wherever the employee has since moved), or looked up live at report-read time? **This needs a decision before the ambulance request form is touched.**

**Possible duplicate-effort check, resolved:** `AmbulanceCMOHistoryScreen.js` (Phase 5.8.2) already has its own KPI panel with date-range filtering and similar columns. Confirmed with Homi this is **not** a duplicate — that screen is the operational, real-time drill-down view; this report is the analytical, exportable, CMO-facing document. Both stay.

**Filters:** employee number, employee name, natureOfVisit, tripRange, falseEmergencyFlag.

**Date scope:** past only, unlimited span, both Daily and Range variants — no future dates, since ambulance requests are on-demand (unlike Trip bookings, which are made in advance).

**Access:** CMO only.

---

### 4. Employee Report

*New report. Consolidates and replaces the old `EmployeeOnlyReportScreen.js`, `PopulationReportScreen.js` (township branch), and the non-township branch of the same screen — those three near-identical filtered views of `employees` become one screen with filters doing the narrowing.*

**Columns:** employeeName, employeeNumber, DOB, CNIC, maritalStatus (as stored: married/unmarried/divorced/widowed), bloodGroup, Grade (`designation`, shown as-is — works uniformly for both plant designations like `Engineer_III_M6` and ESB/school designations like `Senior_Teacher_I`, which don't have a grade code embedded the way plant roles do), Unit, Department, townshipResident (Yes/No, derived from `townshipResidentWithFamily` OR `townshipResidentBachelor`), houseType (`residenceType`, shown as stored — full values like `A-Type`/`D-Plus`/`Guest House`, not abbreviated codes), houseNumber (`houseNumber` or `roomNumber`, whichever is populated), phoneNumber, totalNoOfFamilyMembers (count of `familyMembers` where `relation` is spouse/son/daughter, **`isActive: true` and `status: "validated"` only**), residentGuests (**deferred to V2** — no capture flow exists yet).

**Filters:** ageGroup (40+ / Below 40 — a real operational threshold for annual fitness planning, not an arbitrary bracket), Department, Unit, Grade, Township Resident, HouseType, maritalStatus, bloodGroup.

**Row shape:** one row per employee — deliberately not one row per family member, to keep this a clean, genuinely flat table. Family-level detail lives entirely in the separate Family Report below.

**Access:** CMO only.

---

### 5. Family Report

*New report. Deliberately split out from Employee Report specifically to avoid forcing family-level granularity onto a table that's supposed to stay one-row-per-employee.*

**Columns:** employeeName, employeeNumber, townshipResident, houseType, houseNumber (same source/display rules as Employee Report), then per-family-member groups:
- **Spouse** (default: 1 column group — Name/Age/BloodGroup)
- **Child 1–5** (default: 5 column groups — Name/Age/BloodGroup each, eldest to youngest)

**Family member inclusion rule:** `isActive: true` AND `status: "validated"` only — same standard as Employee Report's household count.

**Ages:** computed live from `dateOfBirth`, reusing the existing calculation already built into `FamilyMemberAddScreen.js`/`FamilyMemberEditScreen.js` (the "Age: X years" live display), not rebuilt from scratch.

**Overflow handling (both spouse and children):** collapsible in the in-app view — a single row per employee that expands on tap for anyone exceeding the default column count (more than 1 active spouse, more than 5 children). **PDF always renders fully expanded, no cap, regardless of count** — since PDFs are shared as soft copies most of the time rather than printed, a capped PDF with a "see app for more" note would be an incomplete document in the hands of whoever received it.

**Multiple-spouse handling — mirrors the children pattern exactly**, extending it because Pakistani family law permits up to four wives, so this isn't purely a today's-edge-case concern: default 1 spouse column, collapsible beyond that, always fully expanded in PDF. **This specific mirroring was proposed but not explicitly confirmed by Homi before the session moved on — flag as needing a final yes/no before building.**

**Filters:** employeeNumber, employeeName, townshipResident.

**Access:** CMO only.

---

### 6. Blood Donor Report

*Redesign of the existing `BloodGroupReportScreen.js` — replaces it entirely, does not coexist alongside it. The old screen queried `employees` directly and only ever showed employee donors; it has been missing every family-member donor since Phase 4 (Day 14), when `bloodDonorRegistry` first gained family-keyed entries that the report screen was simply never updated to read.*

**Columns:** bloodDonorName (`bloodDonorRegistry.fullName`), employeeNumber (`officialEmployeeNumber` — already the sponsor's number for family entries), Relation (family-keyed entries: `relation`; employee-keyed entries: display **"Self"**, since those records have no `relation` field at all), Age (joined: employee-keyed → `employees.dateOfBirth`; family-keyed → `familyMembers.dateOfBirth`), bloodGroup, phoneNumber (already the sponsoring employee's number for both entry types — no extra work needed, confirmed directly from schema), ResidentialStatus (joined via `employeeId` → Township Resident / Non-Resident).

**Data source switches from `employees` to `bloodDonorRegistry`** — the collection that has actually held both employee and family donor consent since Phase 4, which the old screen never read from.

**Live-status filtering, not a passive read of whatever's in the registry:** a deactivated employee or family member, or anyone who has withdrawn consent, must **vanish from this report immediately** — this is a contact list for reaching actual willing donors in an emergency, not a historical record. Since `bloodDonorRegistry` is a separate collection with no confirmed automatic cleanup on deactivation, the report must **actively filter on live status at read time**: employee-keyed entries only included if the employee is currently `isActive` and `isValidated`; family-keyed entries only included if the sponsoring employee is active **and** the family member is `isActive: true` and `status: "validated"`. This is belt-and-suspenders by design — it guarantees the stated behavior regardless of whether some other cleanup mechanism exists that hasn't been reviewed.

**Top summary tiles (Blood Group Distribution grid) stay exactly as-is** — employee-only census, unchanged in scope, since Homi's instruction was to keep it intact rather than widen it to include family members.

**Filter:** Blood Group.

**Export switches from CSV to PDF**, matching the universal rule — worth confirming with Homi if the CSV export needs to be kept for some downstream use before it's dropped.

**Access:** admin_incharge, reception, doctor, CMO — wider than most other reports in this batch, since this one serves an operational "who do we call" purpose rather than an administrative review purpose.

---

### 7. Employee Chronic Disease Report

*New report.*

**Columns:** employeeName, employeeNumber, Age, Diabetes (Yes/No), Hypertension (Yes/No), Ischemic Heart Disease (Yes/No), Deranged Lipid Profile (Yes/No) — all four derived from whether the string appears in `employees/{id}/private/medical.chronicDisease[]` — Smoker (Yes/No, from `employees.isSmoker`).

**Cost note, not a blocker:** this is the only report reading from `private/medical`, the one subcollection in the whole schema that exists purely because Firestore rules can't hide a single field inside an otherwise-open document. Generating this report means one extra read per employee on top of the normal `employees` read — for ~1,000 employees, roughly 1,000 extra reads per generation. Fine for CMO-only, infrequent use; worth revisiting if this ever becomes a frequently-refreshed screen.

**No new privacy exposure:** CMO already sees chronic disease during user approval (visible on `UserApprovalScreen.js`), so CMO-only access to this report doesn't surface anything CMO couldn't already see elsewhere.

**Smoker status confirmed safe and already changeable** — `isSmoker` is self-editable via `MyProfileScreen.js`'s existing "Smoker Status" toggle (Day 14 fix #5), already wired end-to-end. Initially miscategorized mid-session as a missing capability; corrected after actually reading `employeeRoutes.js` and `MyProfileScreen.js` rather than trusting an earlier partial read of `authRoutes.js` alone.

**Top summary:** counts for Smokers, Diabetic, Hypertensive, Ischemic Heart Disease, Deranged Lipid Profile.

**Filters:** employeeName, employeeNumber, and Yes/No on each of the 5 conditions.

**Access:** CMO only.

---

### 8. Population Report

**Shape:** grouped summary cards/tiles, not a row-per-record table — a genuinely different report shape from every other one in this batch, closer to a statistics dashboard.

**Figures, fully defined:**
1. Total No. of Employees
2. Total No. of Management Employees
3. Total No. of Non-Management Employees
4. Total No. of ESB Employees
5–8. **Township Population** — defined as **headcount of employees who are township residents (family or bachelor type) plus their active/validated spouse and children** (not employee-count alone — the age-bracket figures below only make sense against a headcount that includes children):
   - Total
   - House-type-wise breakdown
   - Age brackets (less than 2, 2–12, 13–18, 18 and above), **segregated by the sponsoring employee's `employeeType`** (management/non-management) — family members inherit this classification from their sponsor, since they have no `employeeType` of their own
   - Male/female breakdown, same management/non-management segregation — **unblocked by the gender fix above**; previously impossible, since no gender field existed anywhere
9. maritalStatus breakdown — all four categories as stored (married, unmarried, divorced, widowed), no collapsing
10. Township resident vs. outside employee count
11. Total population living outside (non-resident employees + their active/validated spouse and children)
12. Family-member count for employees living in bachelor/single accommodation in township whose family lives elsewhere — inferred as **`townshipResidentBachelor: true` AND `maritalStatus: married`** (bachelor housing + married implies a family exists but isn't housed with them; there is no direct "family lives outside" flag, so this is the agreed inference rule)

**Access:** CMO only (implied by consistency with the rest of this batch; not explicitly re-stated for this report but no reason given to differ).

---

### 9. Annual Fitness Report

*New report — this is one of the two "orphan `reportRoutes.js` routes with no frontend tile" resolved this session (the other being Feedback, below). The backend, `GET /fitness`, already exists and is already correct — a past-session fix already corrected it to read `fitnessOutcome` (not the non-existent `fitnessStatus`) and rename `conditional` to the real live value `fit_with_restrictions`. This report only needs a frontend built against that already-working route.*

**Columns:** employeeName (`fitnessAppointments.fullName`), employeeNumber (joined via `employeeId` → `employees.officialEmployeeNumber`), Age (joined via `employeeId` → `employees.dateOfBirth`), Department (joined via `employeeId` → `employees.department`, **live**, not the value snapshotted onto the appointment at scheduling time), Unit (joined via `employeeId` → `employees.unit`, live — `unit` isn't captured on the appointment record at all), fitnessCompletedOn (`completedAt`), fitnessStatus (display label for the real field `fitnessOutcome` — values `fit`/`unfit`/`fit_with_restrictions`; flagging this mapping explicitly since a field-name mismatch is exactly what caused this route's original bug).

**Scope:** `status: "completed"` only — scheduled and missed appointments excluded entirely, since the report's own columns (completion date, outcome) have no meaning for anything not yet completed.

**Date scoping:** a year selector (using the existing `cycleYear` field), **dynamically populated with every year that has data** rather than a hardcoded list — displayed as **"{year} Report"** (e.g. "2025 Report") rather than a bare year number — then optional from/to narrowing on `fitnessCompletedOn`, bounded within the selected year (not an open-ended range like Trip or Ambulance Range).

**Top summary:** Total Fitness Completed, Fit, Unfit, Fit with Restriction — all already computed correctly by the existing backend route's `summary.byFitnessStatus` object.

**Filters:** Department, Unit, EmployeeNumber, EmployeeName, Fitness Status.

**Access:** CMO only — narrowed from the existing route's current CMO/Doctor/Admin Incharge access. Safe to narrow: nothing currently calls this route (it has no frontend tile yet), so no existing consumer is affected.

---

### 10. Feedback Report

*New report — the second orphan-route resolution. `reportRoutes.js`'s `GET /feedback` was already fixed in Phase 9 (correct nested `ratings.*` field names, role list locked to CMO-only) but never got a frontend screen.*

**Shape:** tiled, matching Population Report's style — top summary tiles plus a trend chart, not a row table.

**Two collections involved, correctly separate in the schema:**
- `feedback` — per-visit ratings across up to 9 parameters
- `suggestions` — a completely separate, standalone general-purpose suggestion box, unrelated to any specific visit

**Top tiles:**
- Total No. of Feedbacks
- **Overall Cumulative Satisfaction Rating** — defined as the average of the **3 mandatory rating parameters** every submission has (housekeeping, staffBehaviour, waitingTime). There is no single field that already means "overall rating" — `overallExperience` is a free-text comment field, not a numeric score, so this figure had to be explicitly defined rather than read directly.
- Total No. of Suggestions Received — a plain document count on the separate `suggestions` collection.

**Per-parameter cumulative ratings (all 9):** the 3 mandatory parameters averaged across every submission; the 6 conditional parameters (consultation, dental, laboratory, nursing, pharmacy, physiotherapy, xray) each **averaged only across submissions where that specific service was actually used** — not treated as zero when the rating doesn't exist for a given submission. This distinction matters and is easy to get subtly wrong, since most of the 9 parameters are conditional, not universal.

**Trend chart:** line chart, one line per year, months (Jan–Dec) along the x-axis — lets multiple years' monthly averages be visually compared at a glance. Defaults to showing **Overall Satisfaction**, with a selector to switch to any individual one of the 9 parameters. Explicitly designed for forum presentation — this is expected to be the most-viewed report of the batch.

**Month/year scope selector:** dynamic year list (grows automatically as real data accumulates — no hardcoded range), same pattern as every other report in this batch.

**"To-date" behavior for the current month:** requires no special logic — a plain "feedback submitted within the selected month" query is automatically "to-date," since feedback dated in the future cannot exist.

**Expected sparse-data period:** since all current data is test data slated for deletion before launch, this chart will show very little (potentially a single data point) for the first several months after go-live. Not a bug — expected and worth knowing in advance so it isn't mistaken for something broken the first time it's shown.

**Access:** CMO only.

---

## Build session (Day 24)

Everything below happened after this document's spec was locked — build order, decisions made mid-build, bugs found, and deviations from the spec above. The spec sections above are left exactly as they were written at lock time, including the parts later corrected here, so this file stays an honest record of what was decided when.

### Build order

Simplest-first, chosen and executed in this sequence: **Annual Fitness Report → Trip Day Report → Trip Range Report → Employee Chronic Disease Report → [Blood Donor Report attempted, deferred] → Feedback Report → Employee Report → Population Report → Family Report → Ambulance KPI Report → [deactivation cascade side-quest] → Blood Donor Report (finally built)**.

### Report-by-report build notes

**Annual Fitness Report.** Built as specced. One open finding on first live test: Department/Unit showed blank for 3 of 4 test employees. Employee number resolved correctly for all 4 (via the same join), which rules out a broken join — the live evidence points to a genuine data gap on those specific pre-fix test accounts, not a join bug. Deferred to fresh-data review rather than resolved outright; not yet re-confirmed either way.

**Trip Day Report, Trip Range Report.** Built as specced. Both confirmed working in live review with no deviations.

**Employee Chronic Disease Report.** Built as specced, confirmed working.

**Blood Donor Report — first attempt.** Building the live-status filter required checking whether a donor's sponsoring employee was currently active. This surfaced that `employees` has **no `isActive` field of its own** — only the linked `users` document does. Rather than patch around this narrowly inside one report, Homi's explicit call was to treat it as its own real design discussion, deferring this report until that was resolved. See the "Employee deactivation cascade" section below for the full resolution; Blood Donor Report itself was finished only after that work was done.

**Feedback Report.** Built as specced with one real deviation: the spec assumed "up to 9 parameters" and named 6 conditional ones, but the spec's own listed names (consultation, dental, laboratory, nursing, pharmacy, physiotherapy, xray) actually total 7 — confirmed against the real schema as 3 mandatory + 7 conditional = 10 total, not 9. Confirmed with Homi directly: build against the real 10, the doc's count label was simply wrong. A second deviation: the trend chart was specced assuming a charting library would be available, but none was confirmed present in the project. Rather than add a new dependency without checking, the trend chart was built as a plain-View grouped bar chart using only core React Native components — a bar per year, per month, not a smooth line. Functionally equivalent, visually different from what the spec implied. Can be upgraded later if a real charting library turns out to already be in the project.

**Employee Report, Population Report, Family Report.** All three initially built joining `familyMembers` against `employees.id` (the `employees` collection's own auto-generated Firestore doc ID) instead of `employees.userId` (the real join key — `familyMembers.employeeId` stores the Auth UID, not the employees doc ID). This silently produced a family count of 0 in all three reports. Caught and fixed before any of the three were used for a real decision — `FamilyAdminReviewScreen.js`'s own existing code comment already stated the correct join key correctly, which is what surfaced the mistake on review of that file for an unrelated reason. Same shape of mistake as Phase 11's `familyMembers`-as-subcollection bug: the correct answer was already sitting in already-reviewed code, and the wrong assumption was made anyway. All three reports confirmed working after the fix. Population Report's figure 9 (marital status breakdown) was built company-wide rather than scoped to township residents — the spec numbered it standalone ("9.") rather than nested under the explicitly-grouped "5–8" township figures, which was the reasoning applied at build time, but this was never put to Homi as an explicit yes/no the way the ESB-bucket question below was. Flagged for awareness; the report passed review overall, but this specific assumption was never directly confirmed.

Population Report figures 7 and 8 (age brackets, gender) named only management/non-management buckets in the spec, but employees actually have a third `employeeType` value, ESB. Confirmed with Homi directly: ESB gets its own third bucket in both figures, not folded into non-management.

**Ambulance KPI Report.** Required its prerequisite — the `houseNumber` auto-lock — before the report itself could be finished. This is where the spec's still-open implementation question got resolved, and it turned out to be a bigger fork than the spec anticipated: the spec's phrasing ("auto-lock houseNumber... currently a free-text field on the ambulance request form") could have meant either adding a new dedicated field, or locking the existing `pickupLocation` field itself. These have very different operational consequences — `pickupLocation` is the field dispatch actually uses, and it's deliberately overridable today because a patient isn't always at their registered address. Locking it would have removed real dispatch flexibility. Resolved via a direct question to Homi: add a **new, separate** field, `houseNumber`, auto-locked and snapshotted server-side at request creation (both the self-request and reception-on-behalf paths, resolved server-side and never trusted from the client — same pattern already used for `employeeNumber`), and leave `pickupLocation` completely untouched. The report itself was then built exactly as specced, confirmed working.

**Blood Donor Report — completed.** Once the deactivation cascade work (below) was done, this report was finished: reads `bloodDonorRegistry`, joins the employee side via `userId` (applying the same join-key lesson learned earlier this session), filters both entry types (employee-keyed and family-keyed) through the now-resolved active-status logic. Export kept as **both CSV and PDF** — the spec had assumed a switch to PDF-only per the universal rule, but Homi's direct call was to keep CSV too, since it's more flexible for downstream analysis. Confirmed working.

### Employee deactivation cascade — grew out of Blood Donor Report, treated as its own mini-project

Matching how Phases 4/5/6 grew from quick gap audits into full design sessions once a genuine gap turned up, this wasn't patched narrowly — it was worked through as a real, separate design discussion before Blood Donor Report was finished.

**What already existed, confirmed by reading the actual code rather than assumed:** `users.isActive` was already toggleable via a "Disable Account"/"Re-enable Account" flow in `UserManagementScreen.js` (`authRoutes.js`'s `POST /disable-user`/`POST /enable-user`). `familyMembers.isActive` was already individually toggleable per member via `FamilyAdminReviewScreen.js`'s "Disable" flow, with a `disabledReason` of `deceased` or `divorced`. The actual gap was narrow: disabling an employee's account did not cascade to their family members at all.

**Decisions confirmed directly with Homi, not assumed:**
- Cascade should be a **stored write** (each family member's `isActive` physically flipped and tagged), not a live check computed at read time.
- Re-enabling an employee should **automatically restore** the family members who were disabled by that specific cascade.

**What was built:**
- `POST /disable-user` now batch-disables every one of that employee's currently-active `familyMembers` in the same request, tagged `disabledReason: 'sponsor_deactivated'` — a value distinct from the existing `deceased`/`divorced` reasons an admin sets on an individual member, so the two can never be confused.
- `POST /enable-user` reverses it symmetrically, restoring only members carrying that specific `sponsor_deactivated` tag — a genuinely deceased or divorced member stays disabled even if the sponsoring employee is later re-enabled.
- Matched via `familyMembers.employeeId == uid`, the same query pattern `FamilyAdminReviewScreen.js` already used — confirmed correct, not re-derived from scratch.

**A real security gap found and closed while building this, bigger than the cascade itself:** reading `authRoutes.js`'s `verifyRole` middleware (used across most of the backend) showed it checked role membership only — never `isActive`. A disabled account with an already-valid token, or anyone who managed to sign back in, could keep using any route built on that middleware; `POST /disable-user` only ever flipped a Firestore field, never touched the underlying Firebase Auth account. Fixed directly in `verifyRole`, which protects `reportRoutes.js` and `employeeRoutes.js`. Every other backend file turned out to have its **own separate**, standalone role-check pattern rather than importing that shared middleware, so each needed checking individually — this became a full audit, not a one-file fix:
- `fitnessRoutes.js` and `notificationRoutes.js` — already had their own independent `authenticate` middleware that already checked `isActive`. No fix needed; verified by reading the actual code, not assumed.
- `ambulanceRoutes.js`, `tripRoutes.js`, `directoryRoutes.js`, `circularRoutes.js` — each had a standalone `getUserRole(uid)` helper with no `isActive` check. Fixed in every case with a one-line addition inside that helper — every route in each file already called it first, so the fix protects the whole file with no other changes needed.
- `availabilityRoutes.js` — its three write routes (`/update`, `/schedule-leave`, `/cancel-leave`) use the shared, now-fixed `verifyRole` and are protected. Its read-only `GET /all` uses `verifyToken` alone, with no role or `isActive` check at all. Left open deliberately — no write access, and doctor-availability status isn't sensitive information.
- `vaccinationRoutes.js` — deliberately not audited; Vaccination is V2 scope, per Homi's explicit call.
- `LoginScreen.js` was separately confirmed (by reading the actual file, not assumed) to already correctly block sign-in for a disabled account, checking `user.isActive` after authentication and signing the user back out with an "Account Pending" message if false. This means the `verifyRole`/`getUserRole` fixes above are defense-in-depth for an already-active session — closing the gap where someone is disabled *while* still logged in — not the primary access gate, which was already solid.

**Retrofit to the four census reports:** Employee Report, Employee Chronic Disease Report, Population Report, and Family Report were all updated to filter on `activeUserMap[e.userId] === true` in addition to `isValidated` — a shared `getActiveUserMap(db)` helper added to `reportRoutes.js` for this, one `users` read reused across all four rather than duplicated per report. Deliberately **not** applied to the four historical/event-log reports in this batch (Trip Day/Range, Ambulance KPI, Annual Fitness, Feedback) — those record things that already happened, and filtering by an employee's *current* status would hide real past events and skew trend data (a resigned employee's completed fitness exam, or their historical KPI response times, are still real facts).

**Two more bugs found and fixed while building this, both flagged clearly:**
- `FamilyAdminReviewScreen.js`'s disabled-member badge was a two-way ternary — `deceased` vs. an unconditional "Divorced" for anything else. A member disabled via the new `sponsor_deactivated` cascade would have silently displayed as "Divorced," which is both factually wrong and could be genuinely upsetting to see next to, say, a child's name. Fixed to handle all three real values explicitly via a proper label map.
- `UserManagementScreen.js`'s Disable/Enable confirmation dialogs said nothing about the cascade — an admin confirming "Disable Account" had no way to know family members would also be affected until after the fact, and there was no success feedback at all (only a failure alert existed). Fixed: both dialogs now mention the cascade upfront, and both actions now show a success message naming the affected family-member count — but only when it's greater than 0, so a driver or reception account with no family members stays quiet, and a married employee sees exactly what changed.

### File cleanup — two passes

**First pass:** `TripMonthlyReportScreen.js`, `EmployeeOnlyReportScreen.js`, `BloodGroupReportScreen.js` — all three confirmed orphaned (fully replaced, nothing in the hub or navigation still pointed to them) and deleted.

**`/trips` orphan-route resolution.** `reportRoutes.js`'s general-purpose `GET /trips` (a date-range/month booking summary, distinct from `/trip-day` and `/trips/range`) was suspected orphaned but not confirmed until traced end-to-end: `TripReportScreen.js` (a separate operational trip-flow screen, not a Phase 10 report) turned out to call `${API.trips}/all`, which — confirmed via `api.js` — resolves to an entirely different Cloud Function (`tripRoutes.js`'s own, unrelated `GET /all`), not `reportRoutes.js`'s `/trips` at all, despite the similarly-named paths. With that ruled out, and no report screen (old or new) calling it either, `GET /trips` was confirmed genuinely orphaned and removed, along with its only-used-there `dayOfWeekFrom` helper (dead once its only caller was gone).

**Second pass, held back deliberately:** `PopulationReportScreen.js` was left in place, along with its two `AppNavigator.js` nav entries (`TownshipReport`/`NonTownshipReport`), as a fallback until Employee Report and Population Report were both independently confirmed working in live review — not deleted at the same time as the other three, since those two new reports hadn't been tested yet at that point. Deleted, along with both nav entries, once that confirmation came in.

---

## Explicitly out of scope for this phase (V2 or later)

- **residentGuests** (Employee Report) — no capture flow exists; deferred alongside the original V2 backlog item for non-entitled resident relatives.
- **Report file archive / history of previously-generated PDFs** — raised and clarified mid-session as a possible second meaning of "access past reports." Confirmed with Homi that what was actually wanted was live historical *data* access (already covered by every report's date-range/year selector), not a persistent archive of previously-generated PDF files. If a genuine report-archive feature is wanted later, it is a real, separate cross-cutting feature (Storage writes, a generation-log, a browse/retrieve screen) deserving its own design discussion, not something folded into any single report's spec.

---

## Open items — resolved

All five items below were open at the end of the Day 23 spec session. Each is resolved as of the Day 24 build session; see "Build session" above for full detail on each.

1. ~~Family Report's multiple-spouse handling (mirroring the children collapsible pattern) was proposed but never explicitly confirmed~~ — **Resolved:** confirmed, same collapsible pattern as children, extending it for the same reason it was proposed (Pakistani family law permits up to four wives).
2. ~~Ambulance KPI Report's houseNumber auto-lock: snapshot-at-creation vs. live-lookup-at-report-time~~ — **Resolved:** new, separate, auto-locked field, snapshotted server-side at request creation on both the self-request and reception-on-behalf paths. `pickupLocation` deliberately left untouched and still overridable — see the build-session note above for the real design fork this turned out to be.
3. ~~Blood Donor Report's CSV-to-PDF export switch — not explicitly confirmed as acceptable~~ — **Resolved:** keep both CSV and PDF, not a switch. Homi's direct call — CSV is more flexible for downstream analysis.
4. ~~Build order across all 10 reports — not decided~~ — **Resolved:** simplest-first; actual sequence documented under "Build order" above.
5. ~~`SCHEMA_REFERENCE.md` updates outstanding~~ — **Resolved:** done as part of the Day 24 schema revision, along with everything else that came out of the build session itself (`ambulanceRequests.houseNumber`, the `familyMembers.disabledReason`/`reEnabledAt`/`reEnabledBy` additions, the `tripBookings` stale-note correction, and the full `isActive` enforcement writeup).