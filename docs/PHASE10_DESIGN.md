# Phase 10 — Reports Module: Design Document

Companion to `COMMAND_BOARD.md`'s Phase 10 entry, same relationship `PHASE4_DESIGN.md` and `PHASE5_DESIGN.md` have to their phases. This file is the full record of every decision made while speccing the Reports module — every locked field, every rejected alternative, every open question. The Command Board only summarizes what shipped; this is where the "why" lives.

**Status at time of writing: specs locked, nothing built yet.** This session was requirements discussion and two standalone bug fixes only. Build order for the 10 report screens below is not yet decided — that's the first task of the next session.

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

## Explicitly out of scope for this phase (V2 or later)

- **residentGuests** (Employee Report) — no capture flow exists; deferred alongside the original V2 backlog item for non-entitled resident relatives.
- **Report file archive / history of previously-generated PDFs** — raised and clarified mid-session as a possible second meaning of "access past reports." Confirmed with Homi that what was actually wanted was live historical *data* access (already covered by every report's date-range/year selector), not a persistent archive of previously-generated PDF files. If a genuine report-archive feature is wanted later, it is a real, separate cross-cutting feature (Storage writes, a generation-log, a browse/retrieve screen) deserving its own design discussion, not something folded into any single report's spec.

---

## Open items carried into the next session

1. **Family Report's multiple-spouse handling** (mirroring the children collapsible pattern) was proposed but never explicitly confirmed — needs a yes/no before this report is built.
2. **Ambulance KPI Report's houseNumber auto-lock**: snapshot-at-creation vs. live-lookup-at-report-time is not yet decided. This blocks the ambulance request form change (a prerequisite for the report itself, not part of the report screen).
3. **Blood Donor Report's CSV-to-PDF export switch** — not explicitly confirmed as acceptable; the old screen's CSV export may serve a downstream consumer not reviewed this session.
4. **Build order across all 10 reports** — not decided. Next session should open with this.
5. **`SCHEMA_REFERENCE.md` updates outstanding** (doc-only, no code involved): add `employees.dateOfBirth` (timestamp), `employees.gender` / `familyMembers.gender` (string), and `ambulanceRequests.falseEmergencyFlag`/`falseEmergencyFlaggedAt`/`falseEmergencyFlaggedBy` (all three already live, none currently documented).
