# FFL Medical Centre — Firestore Schema Reference

Generated from live production data review. This reflects the **actual** schema as observed in Firestore, not the planned schema — treat this as ground truth over any prior planning notes if they conflict.

**Day 13 revision note:** This file was last generated Day 10 and had drifted in several places after a 3-month gap in active work. This revision corrects it against fresh live Firestore screenshots (console, `config/dropdowns`, and sample documents from every top-level collection). Corrections from the Day 10 version are marked inline as **[Day 13 correction]**. All current data in every collection is **test data** and will be cleared before launch — this doc describes structure, not real production records.

**Day 14 revision note:** Phase 4 (My Profile) shipped a large number of new fields across `employees`, `familyMembers`, and a brand-new `bloodDonorRegistry` collection, plus a new protected subcollection (`employees/{id}/private/medical`). This revision reflects all of that, marked inline as **[Day 14]**. **Basis for this revision differs from Day 13's:** this was refreshed from the code that shipped this session (authoritative for what gets written) plus the live Firestore screenshots reviewed during Phase 4's live testing — not a fresh full console export of every collection. Sections not touched this session (`ambulanceRequests`, `circulars`, `doctorAvailability`, `doctorDirectory`, `feedback`, `fitnessAppointments`, `mail`, `healthTips`, `notifications`, `tripBookings`, `users`, vaccination collections) are carried over unchanged from Day 13 and were not re-verified. A full fresh export, the way Day 13's was done, would still be worth doing at some point — this gets the doc back to trustworthy for what changed, not a ground-up re-verification of everything.

**Day 16–17 revision note:** `ambulanceRequests` and `users` updated, marked inline as **[Day 16–17]**. Same basis as Day 14's approach — refreshed directly from `ambulanceRoutes.js` and `authRoutes.js` as they stand after Phase 5 subphases 5.1–5.6.3, not a fresh console export. `ambulanceRequests` specifically had been flagged as unverified since Day 13 (see the note above) — this is its first real re-verification, not just an incremental update on top of an already-shaky baseline. All other sections remain exactly as they were at Day 14 and are still unverified past that point.

**Day 21 revision note:** `feedback` updated to reflect the full real field set (per-service `ratings.*` and `booleans.*` fields were previously undocumented, confirmed directly against `feedbackRoutes.js` and live Firestore data during Phase 9). New `suggestions` collection added — built this session, has no prior history to correct. `users` gets a small addition noting the two new lightweight role values. Basis: `feedbackRoutes.js`, `FeedbackFormScreen.js`, and live Firestore screenshots reviewed during Phase 9's testing — not a fresh full console export. A real bug was also found while doing this reconciliation, unrelated to anything fixed this session — see the note under `feedback` below.

**Day 22 revision note (final):** Two threads closed this session.

**(1) `purposeOfVisit` — fixed.** The bug flagged Day 21 as "not yet fixed" is now fixed: `feedbackRoutes.js`'s `POST /submit` correctly saves it. Two follow-ups from that same finding remain open, not yet built: no server-side validation actually enforcing it as mandatory, and `GET /all` / `GET /:feedbackId` still don't project it into their response shape — so it's saved going forward, but not yet visible on any review screen.

**(2) Phase 11 (Medical Trip) — closed.** `tripBookings` gets three real additions this session: `hospital` (fixed — see its own note below), `patientFamilyMemberId` (new), `cancelReason` (new). `patientRelation`'s valid set is now locked to `Self` / `Spouse` / `Son` / `Daughter` only — previously unrestricted free text (Father/Mother/Other/Wife dropped; V1's `familyMembers` never modeled parents or other relatives, so those options could never be verified against anything real). A structural misunderstanding surfaced and was corrected mid-build, worth flagging clearly so it isn't repeated: `familyMembers` was mistakenly assumed to live as a *subcollection* under `employees/{id}` — matching the shape of `employeeRoutes.js`'s `/:employeeId/family-members` routes — when it's actually a **top-level** collection, exactly as this doc already correctly stated further down. Those `employeeRoutes.js` routes write to and read from a path that nothing else in the app uses; they are dead code, not the real integration point, and should probably be removed or investigated in a future Family-module session. Basis for this section: `tripRoutes.js`, `TripBookingScreen.js`, and `EmployeeHome.js` (which already queried the top-level collection correctly), plus live Firestore console screenshots reviewed directly during this review — not a fresh full export.

**(3) Phase 12 (Fitness Scheduling) — closed.** No schema changes from Phase 12's own fix (a frontend-only History tab), but reviewing this collection surfaced that its field list below was itself incomplete: `cancelReason`, `cancelledAt`, `cancelledBy`, and `confirmedAt` are all real, live-written fields (`fitnessRoutes.js`'s cancel and confirm routes) that had never been documented here. Added below.

---

## Top-Level Collections

`ambulanceRequests` · `bloodDonorRegistry` · `circulars` · `config` · `doctorAvailability` · `doctorDirectory` · `employees` · `familyMembers` · `feedback` · `fitnessAppointments` · `healthTips` · `mail` · `notifications` · `suggestions` · `tripBookings` · `users` · `vaccinationRecords` · `vaccinationReports` · `vaccineSchedule`

**[Day 21 correction]** `suggestions` added — new this session (Phase 9), a standalone collection for the general-purpose Suggestions feature, unrelated to `feedback`. See its own section below.

**[Day 13 correction]** `healthTips` added — this collection did not exist at Day 10; it was built Aug 29 and is confirmed live.

**[Day 14 correction]** `bloodDonorRegistry` moved from "referenced but not yet created" to a confirmed live collection — Phase 4 added the employee confirmation flow and family member consent, both of which write here. See its own section below (new Day 14) for field shape — note there are now **two different document-ID schemes** in this one collection.

---

## ambulanceRequests

**[Day 16–17 revision]** Fully re-verified this session — every field below is confirmed directly against `ambulanceRoutes.js` as it stands after Phase 5 (subphases 5.1–5.6.3), not carried over from Day 13's unverified snapshot. `queuePosition` is **not** a stored field — it's computed at read time in `GET /active` and `GET /my-active` and attached to the response, never written to Firestore.

| Field | Type | Notes |
|---|---|---|
| acceptedAt | timestamp / null | |
| acceptedBy | string (uid) / null | |
| arrivedAt | timestamp / null | **[Day 16–17, new]** set when reception confirms arrival at the Medical Centre — the request stays open past this point until drop-off is resolved (5.6.3) |
| assignedDriver | string (uid) / null | since 5.6.2, always the on-duty driver — never client-supplied |
| cancelReason | string / null | e.g. "not required" |
| cancelledAt | timestamp / null | |
| cancelledBy | string (uid) / null | |
| completedAt | timestamp / null | now also set by the drop-off flow (5.6.3), not only the old single-step complete |
| createdAt | timestamp | |
| dispatchedAt | timestamp / null | |
| doctorObserver | string / null | initialized on every request but never set by any route — likely vestigial |
| dropLocation | string / null | |
| dropOffOutcome | string / null | **[Day 16–17, new]** one of `"dropped_off"` / `"referred_outside"` / `"patient_declined"` — set when the drop-off leg is resolved (5.6.3) |
| dropOffTriggeredAt | timestamp / null | **[Day 16–17, new]** set at the same moment as `dropOffOutcome` (5.6.3) |
| employeeNumber | string | **[Day 16–17, new]** identifies which employee/family the request belongs to, independent of who actually submitted it (employee self, or reception on their behalf) — the actual duplicate-request dedup key (5.5) |
| notes | string / null | |
| overriddenBy | string / null | initialized on every request but never set by any route — likely vestigial |
| patientCondition | string | e.g. "chest pain" |
| patientName | string | |
| patientRelation | string | e.g. "Self" |
| pickedUpAt | timestamp / null | |
| pickupLocation | string / null | **[Day 16–17 correction]** nullable, not required — Day 13's doc listed this as plain `string` |
| priorityFlag | string | "routine" / "emergency" |
| purposeOfVisit | string / null | **[Day 16–17, corrected]** "emergency" / "routine_consultation" / "physiotherapy" / "dental" / "lab_sample" — captured by both request screens since before this session, but the backend silently dropped it until the 5.2 fix; genuinely absent from any request document created before that fix went live |
| requestedBy | string (uid) | |
| requestedByType | string | "reception" / "employee" |
| returnedAt | timestamp / null | |
| status | string | **[Day 16–17]** full set: "pending" / "accepted" / "dispatched" / "picked_up" / "returned" / "arrived" / "completed" / "cancelled" — "arrived" is new (5.6.3), sits between "returned" and "completed" |
| tripType | string | "intra_township" / "intercity" |
| vehicleAssigned | string | e.g. "mini" |
| vehicleType | string | e.g. "mini" |

## circulars

| Field | Type | Notes |
|---|---|---|
| category | string | "medical" / "administrative" |
| createdAt | timestamp | |
| fileUrl | string | Firebase Storage URL |
| mimeType | string | e.g. "application/pdf" |
| originalFilename | string | |
| storagePath | string | |
| title | string | |
| uploadedBy | string (uid) | |
| uploadedByRole | string | e.g. "admin_incharge" |

## config/dropdowns

Single document holding shared dropdown option lists. Structure confirmed live, Day 13:

- `bloodGroups[]` — A+, A-, B+, B-, AB+, AB-, O+, O-
- `departments[]` — admin, maintenance, BD, DBN, AIM, HSEQT, EI, Production_S, Production_n, process_Engineering, project_Engineering, ESB, HO_IT, HO_HR, HO_Marketing, HO_Finance, HO_Internal_Audit, HO_SCF
  **[Day 13 correction]** Prior version listed `DSN, ASM, IT` — these were mis-transcribed; live values are `DBN, AIM, EI`. Note also the inconsistent internal casing (`Production_n` vs `Production_S`, `process_Engineering` vs `project_Engineering`) — this is a real casing inconsistency in live config itself, not a transcription issue, and matters for Phase 3 code alignment.
  **[Day 14 update]** `constants.js` now matches this casing exactly, both frontend and backend (Phase 3, closed).
- `employeeTypes[]` — management, non_management, **ESB** (capital, confirmed live)
  **[Day 13 correction]** Prior version said "CSD" — incorrect. Confirmed live value is `"ESB"`. Note the app code (`constants.js`) checks for lowercase `'esb'`, which does not match — this is the confirmed root cause of the empty-ESB-designation-dropdown bug (Phase 1).
- `esbDesignations[]` — **separate top-level list**, not merged into nonManagementDesignations: Director, Principal, Vice_Principal, Head_Mistress, Senior_Teacher_I/II/III, Teacher_I/II/III, Trainee_Teacher, Contract_Teacher, Supervisor
  **[Day 13 correction — important]** Prior version stated ESB/school designations were merged into `nonManagementDesignations[]`. This is **incorrect** — live Firestore confirms `esbDesignations` is its own distinct top-level list, separate from `nonManagementDesignations`. `constants.js`'s approach of keeping `ESB_DESIGNATIONS` separate was correct; the schema doc's prior explanation was wrong.
- `nonManagementDesignations[]` — Supervisor_I_S8, Supervisor_II_S7, Supervisor_III_S6, Head_Operator_S5, Senior_Operator_S4, Operator_I_S3, Operator_II_S2, Operator_III_S1 (fertilizer-plant only — no school/ESB titles, see correction above)
- `managementDesignations[]` — GMM_M13, Senior_Department_Manager_M12A, Department_Manager_M12, Unit_Manager_M11, Senior_Staff_Engineer_M11, Section_Head_M10, Staff_Engineer_M10, Senior_Engineer_M9A, Senior_Engineer_M9, Engineer_I_M8, Engineer_II_M7, Engineer_III_M6, Sr_Sub_Engineer_I_MT6, Sr_Sub_Engineer_II_MT5, Sr_Sub_Engineer_III_MT4, Sub_Engineer_I_MT3, Sub_Engineer_II_MT2, Sub_Engineer_III_MT1, GTE_M5
  **[Day 13 correction]** Prior version listed `Sr_Sub_Engineer_I_M6` (doesn't exist live — real value is `Engineer_III_M6`) and `GTE_M0` (live value is `GTE_M5`). Also confirmed: live list includes **both** `Senior_Engineer_M9A` and `Senior_Engineer_M9` as separate entries — `constants.js`'s fallback list is currently missing the M9A variant (Phase 3 item).
- `maritalStatuses[]` — married, **unmarried**, divorced, widowed
  **[Day 13 correction — confirmed real drift]** `constants.js`'s `MARITAL_STATUSES` fallback uses `'single'` instead of `'unmarried'`. This is not a doc error — it's a genuine app-code mismatch against live config (Phase 3 item).
  **[Day 14 update]** Fixed, both frontend and backend (Phase 3, closed).
- `units{}` — nested by department, lists equipment/machinery/section names
  **[Day 13 correction]** Prior version's example (`CIU_Equipment`, `CIU_Machinery`) does not match live data — real example under Maintenance is `OU_Equipment`, `OU_Machinery`, `NP_Equipment`, `Ammonia_Equipment`, etc. Live `units` keys also follow the same inconsistent casing as `departments[]` above (e.g. `admin` → `industrial_relations`, `horticulture`, `medical_centre`, `security`, `management_club`).
  **[Day 14 update]** Both the key-casing mismatch against `departments[]` (4 keys renamed directly in the console) and the `constants.js` fallback values (several were factually wrong, not just mis-cased — see Command Board Phase 3) are fixed. A duplicate `"admin"` entry in the `admin` units array was also removed.
  **[Day 14 — not stored in this doc]** Chronic disease options (Diabetes, Hypertension, Ischemic Heart Disease, Deranged Lipid Profile) are a **hardcoded constant** (`CHRONIC_DISEASE_OPTIONS` in `constants.js`), not fetched from `config/dropdowns` like the lists above. Worth knowing if a future review assumes every dropdown is config-driven — this one specifically isn't.

## bloodDonorRegistry

**[Day 14 — new section]** Confirmed live. Two different document-ID schemes coexist in this one collection, depending on whether the donor is an employee or a family member — this matters if you ever need to write a rule, route, or query against it.

**Employee-keyed entries** — doc ID = the employee's own Auth UID:

| Field | Type | Notes |
|---|---|---|
| employeeId | string | same as doc ID |
| userId | string (uid) | same as doc ID, kept as an explicit field too |
| fullName | string | |
| officialEmployeeNumber | string | |
| bloodGroup | string | |
| phoneNumber | string | |
| consentGiven | boolean | |
| consentUpdatedAt | timestamp | |

**Family-member-keyed entries** — doc ID = `family_{familyMemberId}`, never the writer's own uid. This distinction is why the Firestore rule for this collection needed an explicit ownership-lookup clause (Day 14 fix) — the original rule assumed doc ID always equals `request.auth.uid`, which only holds for the employee-keyed case.

| Field | Type | Notes |
|---|---|---|
| familyMemberId | string | the `familyMembers` doc ID (also embedded in this doc's own ID after `family_`) |
| employeeId | string (uid) | the **sponsoring** employee, not the donor themselves |
| fullName | string | the family member's own name, not the employee's |
| relation | string | "spouse" / "son" / "daughter" |
| officialEmployeeNumber | string | the sponsoring employee's number — family members have no number of their own |
| bloodGroup | string | |
| phoneNumber | string | the sponsoring employee's phone — this is who'd actually be called to reach this donor |
| consentGiven | boolean | |
| consentUpdatedAt | timestamp | |

Read access restricted to `doctor` / `cmo` / `reception` / `nurse` via Firestore rules — but in practice the Directory screen reads via the backend (`GET /blood-donors/:bloodGroup`), which uses the Admin SDK and bypasses this rule entirely. The rule matters for write access and for any future direct-client read.

## doctorAvailability

| Field | Type | Notes |
|---|---|---|
| currentStatus | string | "available" |
| fullName | string | |
| isAvailable | boolean | |
| updatedAt | timestamp | |
| updatedBy | string (uid) | |

Subcollection: `statusLog` — **[Day 13 correction]** confirmed live (previously "referenced in design doc, not expanded"); currently empty in test data.

**[Day 21 note]** Dentist and Physiotherapist (added Phase 9) deliberately have **no** document here, unlike Doctor/CMO. They're lightweight, feedback-attribution-only roles with no scheduling or dashboard — `feedbackRoutes.js`'s `/doctors` route looks them up separately via `users` role, not through this collection. Don't assume every person selectable as a "consulting provider" on the feedback form has a `doctorAvailability` doc.

## doctorDirectory

| Field | Type | Notes |
|---|---|---|
| address | string | |
| city | string | |
| createdAt | timestamp | |
| createdBy | string (uid) | |
| hospital | string | e.g. "RYK Hospital" |
| name | string | |
| phone | string | |
| speciality | string | |
| updatedAt | timestamp | |

## employees

| Field | Type | Notes |
|---|---|---|
| createdAt | timestamp | |
| fullName | string | |
| isValidated | boolean | |
| officialEmployeeNumber | string | e.g. "FFL-66666" |
| phoneNumber | string | |
| userId | string (uid) | links to `users` collection |
| validatedAt | timestamp | |
| validatedBy | string (uid) | |
| cnic | string | **[Day 14]** captured at signup, locked afterward — admin-only edit |
| maritalStatus | string | **[Day 14]** `married` / `unmarried` / `divorced` / `widowed`; captured at signup, self-editable anytime after |
| isSmoker | boolean | **[Day 14]** captured at signup, self-editable anytime after |
| employeeType | string | **[Day 14]** `management` / `non_management` / `ESB`; admin-entered at approval |
| department | string | **[Day 14]** admin-entered at approval |
| unit | string | **[Day 14]** admin-entered at approval, cascades from department |
| designation | string | **[Day 14]** admin-entered at approval, cascades from employeeType |
| bloodGroup | string | **[Day 14]** admin-entered at approval |
| bloodDonorConsent | boolean | **[Day 14]** self-editable, feeds `bloodDonorRegistry` (employee-keyed entry) |
| dataConfirmedByEmployee | boolean | **[Day 14]** set true once employee confirms admin-entered profile data |
| dataConfirmedAt | timestamp | **[Day 14]** |
| familyDataStatus | string | **[Day 14]** `not_applicable` / `needs_update` / `pending_admin_review` / `complete` — drives the Family tab alert badge |
| familyDataFlagNote | string / null | **[Day 14]** admin's note when manually re-flagging |
| correctionRequested | boolean | **[Day 14]** employee-reported data error, visible to admin |
| correctionRequestNote | string / null | **[Day 14]** |
| townshipResidentWithFamily | boolean | pre-existing (signup) |
| townshipResidentBachelor | boolean | pre-existing (signup) |
| residenceType | string / null | pre-existing (signup) |
| houseNumber | string / null | pre-existing (signup) |
| roomNumber | string / null | pre-existing (signup) |
| cityOfResidence | string / null | pre-existing (signup) |

**[Day 14 note — still likely unused]** `emergencyPhoneNumber`, `landlineExtension` are still accepted by `PUT /:employeeId` but no screen collects them yet, same as the Day 13 note originally flagged — Phase 4 didn't address these.

**[Day 14 note — status unclear, worth checking]** `communityGroup` (admin-only) is set via a separate route, `POST /validate/:employeeId`, which predates Phase 4 and was **not** touched this session. Phase 4's new approval flow (`POST /approve-user` + the profile-data `PUT`) does not call this route. Unclear whether anything currently calls `/validate/:employeeId` at all — worth confirming during Phase 5+ rather than assuming it's still part of the live approval path.

**[Day 14 — new subcollection]** `employees/{employeeId}/private/medical` — single document, doc ID always `medical`. Created specifically because Firestore rules can't hide one field within an otherwise openly-readable document (the `employees` collection's read rule is open to any authenticated user); chronic disease needed genuine structural isolation, not just a rule tweak.

| Field | Type | Notes |
|---|---|---|
| chronicDisease | array&lt;string&gt; / null | multi-select from `CHRONIC_DISEASE_OPTIONS` (Diabetes, Hypertension, Ischemic Heart Disease, Deranged Lipid Profile) |
| updatedAt | timestamp | |
| updatedBy | string (uid) | admin/CMO who last edited |

Read/write restricted to `admin_incharge` and `cmo` only, enforced at the Firestore rules layer.

## familyMembers

| Field | Type | Notes |
|---|---|---|
| bloodGroup | string | |
| cnic | string / null | |
| createdAt | timestamp | |
| dateOfBirth | timestamp | |
| differentlyAbled | boolean | |
| employeeId | string (uid) | |
| employmentStatus | string / null | mandatory 25+ per design doc |
| isActive | boolean | |
| maritalStatus | string / null | mandatory 25+ per design doc — subject to same `'single'` vs `'unmarried'` drift as employees (Phase 3, now closed both places) |
| motherId | string / null | optional, supports multi-spouse scenarios |
| nadraCardNumber | string / null | |
| name | string | |
| pendingRevision | object / null | edit-review pattern |
| rejectionNote | string / null | |
| relation | string | "son" / "daughter" / "spouse" |
| status | string | "validated" / "pending" / "rejected" |
| updatedAt | timestamp | |
| bloodDonorConsent | boolean | **[Day 14]** self-editable (no admin review), disabled for members under 18; feeds `bloodDonorRegistry` (family-keyed entry) |
| disabledReason | string / null | **[Day 14]** `deceased` / `divorced` — spouse only; children only ever get `deceased`; set when admin disables the member |
| disabledAt | timestamp / null | **[Day 14]** |
| disabledBy | string (uid) / null | **[Day 14]** admin who disabled the record |

**[Day 22 — important, read before touching this collection]** This is confirmed as a **top-level** collection — `employeeId` (a string holding the owning employee's Auth uid) is how a document is linked back to its employee, not collection nesting. This was gotten wrong mid-build during Phase 11 despite being correctly stated in this table all along: `employeeRoutes.js` has routes shaped `POST/GET/PUT /:employeeId/family-members` that write to and read from `employees/{employeeId}/familyMembers` as a **subcollection** — a completely different, empty location that nothing real populates. `EmployeeHome.js` queries this collection correctly (top-level, filtered by `employeeId`); `TripBookingScreen.js` initially did not, and was corrected once live data showed the subcollection route returning nothing despite real, validated family records existing. Treat those `employeeRoutes.js` subcollection routes as dead code, not a second valid access path, until someone investigates and either removes or repurposes them.

## feedback

**[Day 21 correction]** Previous version of this table only listed 4 `booleans.*` fields and 3 `ratings.*` fields — the real set is much larger, since every service a patient used gets its own rating and its own set of yes/no questions. Confirmed directly against `feedbackRoutes.js`'s `POST /submit` and live Firestore documents during Phase 9.

| Field | Type | Notes |
|---|---|---|
| booleans.bedLinenClean | boolean | present only if `nursing` in `servicesUsed` |
| booleans.dentalReceiptProvided | boolean | present only if `dental` in `servicesUsed` |
| booleans.dentalRatesSatisfied | boolean | present only if `dental` in `servicesUsed` |
| booleans.dentalTreatmentSatisfied | boolean | present only if `dental` in `servicesUsed` |
| booleans.doctorGaveAmpleTime | boolean | present only if `consultation` in `servicesUsed` |
| booleans.doctorUnderstoodProblem | boolean | present only if `consultation` in `servicesUsed` |
| booleans.labExplainedProcedure | boolean | present only if `laboratory` in `servicesUsed` |
| booleans.labReportsOnTime | boolean | present only if `laboratory` in `servicesUsed` |
| booleans.nursingBehaviour | boolean | present only if `nursing` in `servicesUsed` |
| booleans.pharmacyExplainedMedicine | boolean | present only if `pharmacy` in `servicesUsed` |
| booleans.physioPrivacyMaintained | boolean | present only if `physiotherapy` in `servicesUsed` |
| booleans.physioRatesSatisfied | boolean | present only if `physiotherapy` in `servicesUsed` |
| booleans.physioReceiptProvided | boolean | present only if `physiotherapy` in `servicesUsed` |
| booleans.physioStaffBehaviour | boolean | present only if `physiotherapy` in `servicesUsed` |
| consultingDoctorId | string (uid) | **[Day 21]** can now be a real doctor (via `doctorAvailability`) or a Dentist/Physiotherapist provider (via `users` role lookup) — see `doctorAvailability` and `users` sections below |
| employeeId | string | |
| overallExperience | string / null | |
| patientName | string / null | |
| patientRelation | string | "Self" / "Spouse" / "Child" / "Parent" / "Other" |
| purposeOfVisit | string | **[Day 22, new]** "Emergency" / "Routine Consultation" / "Physiotherapy Visit" / "Dental Treatment Visit" / "Laboratory Sample" — required on the form since before this session, but silently dropped server-side until Day 22 (see correction below). Documents created before Day 22 will not have this field at all. |
| ratings.consultation | number | 1-5, present only if `consultation` in `servicesUsed` |
| ratings.dental | number | 1-5, present only if `dental` in `servicesUsed` |
| ratings.housekeeping | number | 1-5, mandatory on every submission |
| ratings.laboratory | number | 1-5, present only if `laboratory` in `servicesUsed` |
| ratings.nursing | number | 1-5, present only if `nursing` in `servicesUsed` |
| ratings.pharmacy | number | 1-5, present only if `pharmacy` in `servicesUsed` |
| ratings.physiotherapy | number | 1-5, present only if `physiotherapy` in `servicesUsed` |
| ratings.staffBehaviour | number | 1-5, mandatory on every submission |
| ratings.waitingTime | number | 1-5, mandatory on every submission |
| ratings.xray | number | 1-5, present only if `xray` in `servicesUsed` |
| servicesUsed[] | array<string> | any of: "consultation", "pharmacy", "laboratory", "xray", "nursing", "dental", "physiotherapy" |
| submittedAt | string (ISO) | not a Firestore timestamp — plain ISO string from `nowISO()` |
| submittedBy | string (uid) | |
| suggestion | string / null | **[Day 21]** legacy field — the per-visit "Suggestion for Improvement" input was removed from the form in Phase 9. Documents submitted before Phase 9 may have this populated; documents submitted after will always have it as `null`. General suggestions now live in the separate `suggestions` collection below. |
| visitDate | string | YYYY-MM-DD |
| visitTime | string | HH:MM |

**[Day 21 — bug found; Day 22 — fixed]** `FeedbackFormScreen.js` collects and sends a `purposeOfVisit` field (required in the frontend form — "Emergency" / "Routine Consultation" / "Physiotherapy Visit" / "Dental Treatment Visit" / "Laboratory Sample") but `feedbackRoutes.js`'s `POST /submit` never destructured or saved it. The field was silently dropped on every submission — required client-side, sent over the wire, then discarded server-side. **No `feedback` document created before Day 22 has `purposeOfVisit` populated**, despite the form treating it as mandatory throughout. Fixed Day 22: now destructured and saved on every new submission. Two follow-ups from this same finding are still open, not yet built: (1) no server-side validation actually enforcing it as mandatory — a malformed client could still submit `null`; (2) `GET /all` and `GET /:feedbackId` don't yet project this field into their response shape, so it's saved but not yet visible on the CMO's review screens.

**[Day 21 — resolved]** The report-route field-mismatch bug noted here since Day 13 was confirmed and fixed in Phase 9 — see Command Board Phase 9 entry. `reportRoutes.js`'s `/feedback` route now reads the correct nested field names above. No frontend screen exists for this report yet (Phase 10's job).

## suggestions

**[Day 21 — new]** Built in Phase 9. Standalone from `feedback` — a general-purpose suggestion box, not tied to a specific visit. Submitted via a toggle on the employee feedback form; reviewed by CMO as a second tab on the feedback list screen.

| Field | Type | Notes |
|---|---|---|
| employeeId | string / null | |
| submittedAt | string (ISO) | not a Firestore timestamp — plain ISO string from `nowISO()`, same convention as `feedback` |
| submittedBy | string (uid) | |
| suggestionText | string | the only real content field — free text |

## fitnessAppointments

| Field | Type | Notes |
|---|---|---|
| adminNote | string / null | |
| assignedAt | timestamp | |
| assignedBy | string (uid) | |
| cancelledAt | timestamp / null | **[Day 22, added]** confirmed live in `fitnessRoutes.js`'s `POST /:id/cancel` — was missing from this table entirely until this review |
| cancelledBy | string (uid) / null | **[Day 22, added]** |
| cancelReason | string / null | **[Day 22, added]** |
| completedAt | timestamp / null | |
| completedBy | string (uid) / null | |
| completionRemarks | string / null | |
| confirmedAt | timestamp / null | **[Day 22, added]** set by `POST /:id/confirm` (employee confirming attendance) — also missing from this table until this review |
| createdAt | timestamp | |
| cycleYear | number | |
| department | string | |
| employeeId | string | |
| employeeUid | string | |
| fitnessOutcome | string | "fit" / "unfit" / "fit_with_restrictions" |
| fullName | string | |
| notes | string | |
| rejectedAt / rejectedBy | timestamp / string / null | |
| rescheduleReason | string / null | |
| rescheduleRequestedAt | timestamp / null | |
| rescheduledAt / rescheduledBy | timestamp / string / null | |
| rescheduledDate / rescheduledTime | string / null | |
| scheduledDate | string | YYYY-MM-DD |
| scheduledTime | string | HH:MM |
| status | string | **[Day 22, corrected]** full set, confirmed against `fitnessRoutes.js`'s `FITNESS_STATUS`: "scheduled" / "confirmed" / "reschedule_requested" / "rescheduled" / "reschedule_rejected" / "completed" / "cancelled" — prior version of this table only listed "completed", as if it were the only value |

**[Day 13 confirmation]** Confirmed live field is `fitnessOutcome`, not `fitnessStatus` — `reportRoutes.js`'s `/fitness` route reads the wrong field name (Phase 1 item, confirmed root cause).

**[Day 22 note]** Reviewing this collection for Phase 12 (a frontend-only fix — see Command Board) surfaced that this table itself was incomplete, independent of anything that changed in code this session: `cancelReason`, `cancelledAt`, `cancelledBy`, and `confirmedAt` are all fields `fitnessRoutes.js` has always written (via `POST /:id/cancel` and `POST /:id/confirm`), just never documented here. No code changed to produce this correction — this is a doc-only catch-up, same as the `status` value-set correction above.

## mail

Trigger collection for the email extension (Firebase Send Email pattern).

| Field | Type | Notes |
|---|---|---|
| delivery.attempts | number | |
| delivery.endTime / startTime | timestamp | |
| delivery.error | string / null | |
| delivery.info.accepted[] | array<string> | recipient emails |
| delivery.info.pending[] | array | |
| delivery.info.rejected[] | array | |
| delivery.leaseExpireTime | timestamp / null | |
| delivery.state | string | "SUCCESS" |
| message.html | string | |
| message.subject | string | |
| message.to | string | |

## healthTips

**[Day 13 — new collection, added Aug 29]**

| Field | Type | Notes |
|---|---|---|
| createdAt | timestamp | |
| createdBy | string (uid) | |
| isActive | boolean | |
| text | string | tip content, any language or mix |

## notifications

| Field | Type | Notes |
|---|---|---|
| body | string | |
| createdAt | timestamp | |
| isRead | boolean | |
| recipientRole | string | |
| recipientUid | string | |
| referenceId | string | links to source document |
| title | string | |
| type | string | e.g. "fitness" |

## tripBookings

| Field | Type | Notes |
|---|---|---|
| bookedBy | string (uid) | |
| cancelledAt / cancelledBy | timestamp / string / null | |
| cancelReason | string / null | **[Day 22, new]** required when reception cancels someone else's booking; not required and left `null` when an employee cancels their own — see note below |
| confirmedAt / confirmedBy | timestamp / string | |
| createdAt | timestamp | |
| department | string | |
| doctorId / doctorName | string | snapshot at booking time |
| employeeName / employeeNumber | string | |
| hospital | string / null | **[Day 22, new]** snapshot at booking time, alongside `doctorId`/`doctorName` — see note below |
| notes | string / null | |
| overnightStay | boolean | |
| patientFamilyMemberId | string / null | **[Day 22, new]** links to the `familyMembers` doc actually selected — `null` when `patientRelation` is `"Self"`. See note below. |
| patientName / patientRelation | string | **[Day 22]** `patientRelation` valid set is now `"Self"` / `"Spouse"` / `"Son"` / `"Daughter"` only — see note below. Bookings created before Day 22 may have older free-text values (`"Wife"`, `"Father"`, `"Mother"`, `"Other"`) that no longer occur in new bookings. |
| phone | string | |
| pickupHouse | string | |
| referralConfirmed | boolean | |
| returnTrip | boolean | |
| seats | number | max 4 per booking |
| status | string | "confirmed" |
| tripDate | string | YYYY-MM-DD |

**[Day 13 correction — important]** This is a **flat, top-level collection** — each document is a booking directly, confirmed live. `reportRoutes.js`'s trip report routes (`/trip-day`, `/trips/monthly`, `/trips`) instead query a `medicalTrips` collection with a `bookings` subcollection, which **does not exist in live Firestore**. Trip Day Report and Monthly Trip Report have almost certainly never returned real data (Phase 2 item, top priority).

**[Day 22 correction]** The line above used to end with "`tripBookings` has no `hospital` field — reports needing it must look it up via `doctorId` → `doctorDirectory.hospital`." That's no longer accurate. A locked design decision called for `hospital` to be saved as a snapshot at booking time, the same way `doctorName` already is — but `tripRoutes.js`'s `POST /book` was never updated to actually do it. The frontend (`TripBookingScreen.js`) had already been built to capture and send `hospital`; the backend silently dropped it on every submission, exactly the same shape of bug as `purposeOfVisit` in `feedback` (Day 21). Fixed this session. **Bookings created before this fix will have `hospital: null`** — there is no way to backfill it after the fact except by cross-referencing `doctorId` against `doctorDirectory.hospital`, which still works as a fallback for old records. Phase 10 (Reports) should prefer the snapshot on the booking itself for anything created after this fix, and fall back to the `doctorDirectory` lookup only for older bookings.

**[Day 22 — new] Family-linked patient selection.** Booking a trip for anyone other than yourself now requires selecting a real, validated, active record from `familyMembers` — no more free-typing a relation you don't actually have on file. `patientRelation` is restricted to `Self`/`Spouse`/`Son`/`Daughter` (Father/Mother/Other dropped — not modeled in `familyMembers` at all in V1). When a real match doesn't exist yet (family member not registered), the employee is directed to book under `Self` and add a note in the general-purpose `notes` field explaining who the booking is actually for — there is no dedicated field for this; it deliberately reuses `notes`. Verified server-side in `tripRoutes.js`'s `POST /book`, not just filtered client-side: the submitted `patientFamilyMemberId` is checked against the real `familyMembers` document to confirm it exists, belongs to the requesting employee, matches the claimed relation, and is `status: "validated"` and not disabled.

**[Day 22 — new] Reception cancellation reason.** `POST /:id/cancel` now requires a free-text reason when reception cancels someone else's booking (saved to `cancelReason`); an employee cancelling their own booking needs no reason and `cancelReason` stays `null` in that case. The reason is internal only — the employee's cancellation notification is always a fixed, generic line regardless of what reception typed, by design (matches the same pattern already used for the Ambulance module's driver-cancel reason). Admin's cancel permission on this route was removed the same session — Admin's trip access is intentionally read-only now (view via `TripViewScreen.js` only).

**[Day 22 — new] Doctor selection restricted to Rahimyarkhan.** The trip only ever travels to Rahimyarkhan, so as of Day 22 the doctor picker (both `TripBookingScreen.js`'s frontend filter and a matching server-side check in `POST /book`) only allows `doctorDirectory` entries with `city === "Rahimyarkhan"`. This doesn't change `doctorDirectory`'s own schema or its other consumers (e.g. the general Doctors Directory screen still shows every city) — it's a Trip-booking-specific usage constraint, not a data model change.

## users

**[Day 16–17 revision]** `onDuty` is new this session (5.6.1). The other additions below are pre-existing fields, confirmed directly against `authRoutes.js` while reading it in full this session for an unrelated reason — not new, just previously undocumented.

| Field | Type | Notes |
|---|---|---|
| approvedAt | timestamp | |
| approvedBy | string (uid) | |
| createdAt | timestamp | |
| disabledAt | timestamp / null | set by `POST /disable-user` (admin only) |
| disabledBy | string (uid) / null | |
| email | string | |
| isActive | boolean | |
| lastLoginAt | timestamp | |
| onDuty | boolean | **[Day 16–17, new]** driver role only — set `true` on login, `false` on logout (`/update-last-login`, `/set-off-duty` in `authRoutes.js`). Powers ambulance auto-assign on dispatch (5.6.2) and the on-duty info box shown to reception |
| phone | string | |
| reEnabledAt | timestamp / null | set by `POST /enable-user` (admin only) |
| reEnabledBy | string (uid) / null | |
| role | string | "employee" / "reception" / etc. — **[Day 21]** also "dentist" / "physiotherapist" (Phase 9) — see `doctorAvailability` note above; these two are deliberately excluded from that collection |
| roleChangedAt | timestamp / null | set by `POST /change-role` (admin only) |
| roleChangedBy | string (uid) / null | |

## vaccinationRecords

| Field | Type | Notes |
|---|---|---|
| actualDate | timestamp / null | |
| administeredBy | string | e.g. "Zulaikha Yameen" |
| adverseReaction | string / null | |
| createdAt | timestamp | |
| doseNumber | string | e.g. "1st shot" |
| employeeId | string | |
| familyMemberId | string | |
| naReason | string / null | e.g. "Maximum age limit exceeded (168 days)" |
| nurseOverride | boolean | |
| overrideReason | string / null | |
| plannedDate | timestamp | |
| status | string | "na" |
| updatedAt | timestamp | |
| vaccineName | string | |
| vaccineScheduleId | string | links to `vaccineSchedule` |

*(V2 scope — Vaccination flow deferred. Retained here for reference only.)*

## vaccinationReports

| Field | Type | Notes |
|---|---|---|
| generatedAt | timestamp | |
| missed | number | |
| upcoming | number | |
| url | string | Storage URL to weekly PDF |
| weekEnd / weekStart | timestamp | |

*(V2 scope — retained for reference only.)*

## vaccineSchedule

| Field | Type | Notes |
|---|---|---|
| ageUnit | string | "weeks" |
| ageValue | number | |
| createdAt / updatedAt | timestamp | |
| doseNumber | string | |
| isActive | boolean | |
| maximumAgeDays | number / null | |
| minimumIntervalDays | number | |
| route | string | e.g. "intramuscular" |
| site | string | e.g. "lateral aspect of thigh" |
| vaccineName | string | e.g. "DPT + IPV + Hep B + Hib" |
| vaccineType | string | e.g. "inactivated" |

*(V2 scope — retained for reference only.)*

---

*Generated Day 10, corrected Day 13 from live Firestore console screenshots reviewed in session, updated Day 14 from Phase 4 code + live testing screenshots, updated Day 22 from Phase 11/12 code + live testing (not full fresh re-exports — see each day's revision note above for basis). Update this file if the schema changes — treat as a living reference, not a locked spec.*