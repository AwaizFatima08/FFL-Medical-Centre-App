# FFL Medical Centre — Firestore Schema Reference

Generated from live production data review. This reflects the **actual** schema as observed in Firestore, not the planned schema — treat this as ground truth over any prior planning notes if they conflict.

**Day 13 revision note:** This file was last generated Day 10 and had drifted in several places after a 3-month gap in active work. This revision corrects it against fresh live Firestore screenshots (console, `config/dropdowns`, and sample documents from every top-level collection). Corrections from the Day 10 version are marked inline as **[Day 13 correction]**. All current data in every collection is **test data** and will be cleared before launch — this doc describes structure, not real production records.

**Day 14 revision note:** Phase 4 (My Profile) shipped a large number of new fields across `employees`, `familyMembers`, and a brand-new `bloodDonorRegistry` collection, plus a new protected subcollection (`employees/{id}/private/medical`). This revision reflects all of that, marked inline as **[Day 14]**. **Basis for this revision differs from Day 13's:** this was refreshed from the code that shipped this session (authoritative for what gets written) plus the live Firestore screenshots reviewed during Phase 4's live testing — not a fresh full console export of every collection. Sections not touched this session (`ambulanceRequests`, `circulars`, `doctorAvailability`, `doctorDirectory`, `feedback`, `fitnessAppointments`, `mail`, `healthTips`, `notifications`, `tripBookings`, `users`, vaccination collections) are carried over unchanged from Day 13 and were not re-verified. A full fresh export, the way Day 13's was done, would still be worth doing at some point — this gets the doc back to trustworthy for what changed, not a ground-up re-verification of everything.

---

## Top-Level Collections

`ambulanceRequests` · `bloodDonorRegistry` · `circulars` · `config` · `doctorAvailability` · `doctorDirectory` · `employees` · `familyMembers` · `feedback` · `fitnessAppointments` · `healthTips` · `mail` · `notifications` · `tripBookings` · `users` · `vaccinationRecords` · `vaccinationReports` · `vaccineSchedule`

**[Day 13 correction]** `healthTips` added — this collection did not exist at Day 10; it was built Aug 29 and is confirmed live.

**[Day 14 correction]** `bloodDonorRegistry` moved from "referenced but not yet created" to a confirmed live collection — Phase 4 added the employee confirmation flow and family member consent, both of which write here. See its own section below (new Day 14) for field shape — note there are now **two different document-ID schemes** in this one collection.

---

## ambulanceRequests

| Field | Type | Notes |
|---|---|---|
| assignedDriver | string / null | |
| cancelReason | string | e.g. "not required" |
| cancelledAt | timestamp / null | |
| cancelledBy | string (uid) / null | |
| completedAt | timestamp / null | |
| createdAt | timestamp | |
| dispatchedAt | timestamp / null | |
| doctorObserver | string / null | |
| dropLocation | string / null | |
| notes | string / null | |
| overriddenBy | string / null | |
| patientCondition | string | e.g. "chest pain" |
| patientName | string | |
| patientRelation | string | e.g. "Self" |
| pickedUpAt | timestamp / null | |
| pickupLocation | string | house number |
| priorityFlag | string | "routine" / "emergency" |
| requestedBy | string (uid) | |
| requestedByType | string | "reception" / "employee" |
| returnedAt | timestamp / null | |
| status | string | "cancelled" / "completed" / etc. |
| tripType | string | "intra_township" |
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

## feedback

| Field | Type | Notes |
|---|---|---|
| booleans.bedLinenClean | boolean | |
| booleans.doctorGaveAmpleTime | boolean | |
| booleans.doctorUnderstoodProblem | boolean | |
| booleans.nursingBehaviour | boolean | |
| consultingDoctorId | string | |
| employeeId | string | |
| overallExperience | string | e.g. "satisfied" |
| patientName | string | |
| patientRelation | string | |
| ratings.housekeeping | number | 1-5 |
| ratings.staffBehaviour | number | 1-5 |
| ratings.waitingTime | number | 1-5 |
| servicesUsed[] | array<string> | e.g. "consultation", "nursing" |
| submittedAt | timestamp | |
| submittedBy | string (uid) | |
| suggestion | string | |
| visitDate | string | YYYY-MM-DD |
| visitTime | string | HH:MM |

**[Day 13 note]** `reportRoutes.js`'s `/feedback` route reads `staffBehaviourRating`, `cleanlinessRating`, `servicesRating`, and `comments` — none of these match the real field names above (`ratings.staffBehaviour`, `ratings.housekeeping`, `suggestion`). This report has likely never shown correct averages. Not yet added to a numbered phase — flag for Phase 9 (Patient Feedback review).

## fitnessAppointments

| Field | Type | Notes |
|---|---|---|
| adminNote | string / null | |
| assignedAt | timestamp | |
| assignedBy | string (uid) | |
| completedAt | timestamp / null | |
| completedBy | string (uid) / null | |
| completionRemarks | string / null | |
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
| status | string | "completed" |

**[Day 13 confirmation]** Confirmed live field is `fitnessOutcome`, not `fitnessStatus` — `reportRoutes.js`'s `/fitness` route reads the wrong field name (Phase 1 item, confirmed root cause).

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
| confirmedAt / confirmedBy | timestamp / string | |
| createdAt | timestamp | |
| department | string | |
| doctorId / doctorName | string | snapshot at booking time |
| employeeName / employeeNumber | string | |
| notes | string / null | |
| overnightStay | boolean | |
| patientName / patientRelation | string | |
| phone | string | |
| pickupHouse | string | |
| referralConfirmed | boolean | |
| returnTrip | boolean | |
| seats | number | max 4 per booking |
| status | string | "confirmed" |
| tripDate | string | YYYY-MM-DD |

**[Day 13 correction — important]** This is a **flat, top-level collection** — each document is a booking directly, confirmed live. `reportRoutes.js`'s trip report routes (`/trip-day`, `/trips/monthly`, `/trips`) instead query a `medicalTrips` collection with a `bookings` subcollection, which **does not exist in live Firestore**. Trip Day Report and Monthly Trip Report have almost certainly never returned real data (Phase 2 item, top priority). Note also: `tripBookings` has **no `hospital` field** — reports needing it must look it up via `doctorId` → `doctorDirectory.hospital`.

## users

| Field | Type | Notes |
|---|---|---|
| approvedAt | timestamp | |
| approvedBy | string (uid) | |
| createdAt | timestamp | |
| email | string | |
| isActive | boolean | |
| lastLoginAt | timestamp | |
| phone | string | |
| role | string | "employee" / "reception" / etc. |

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

*Generated Day 10, corrected Day 13 from live Firestore console screenshots reviewed in session, updated Day 14 from Phase 4 code + live testing screenshots (not a full fresh re-export — see Day 14 revision note above). Update this file if the schema changes — treat as a living reference, not a locked spec.*