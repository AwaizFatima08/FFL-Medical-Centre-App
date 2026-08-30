# FFL Medical Centre — Firestore Schema Reference

Generated from live production data review. This reflects the **actual** schema as observed in Firestore, not the planned schema — treat this as ground truth over any prior planning notes if they conflict.

**Day 13 revision note:** This file was last generated Day 10 and had drifted in several places after a 3-month gap in active work. This revision corrects it against fresh live Firestore screenshots (console, `config/dropdowns`, and sample documents from every top-level collection). Corrections from the Day 10 version are marked inline as **[Day 13 correction]**. All current data in every collection is **test data** and will be cleared before launch — this doc describes structure, not real production records.

---

## Top-Level Collections

`ambulanceRequests` · `circulars` · `config` · `doctorAvailability` · `doctorDirectory` · `employees` · `familyMembers` · `feedback` · `fitnessAppointments` · `healthTips` · `mail` · `notifications` · `tripBookings` · `users` · `vaccinationRecords` · `vaccinationReports` · `vaccineSchedule`

**[Day 13 correction]** `healthTips` added — this collection did not exist at Day 10; it was built Aug 29 and is confirmed live.

**Note:** `bloodDonorRegistry` is referenced in `employeeRoutes.js` (written on blood donor consent) but does **not** currently appear in the live collection list — Firestore does not create a collection until it holds at least one document, and no test employee has given consent yet. This is expected, not a bug.

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
- `employeeTypes[]` — management, non_management, **ESB** (capital, confirmed live)
  **[Day 13 correction]** Prior version said "CSD" — incorrect. Confirmed live value is `"ESB"`. Note the app code (`constants.js`) checks for lowercase `'esb'`, which does not match — this is the confirmed root cause of the empty-ESB-designation-dropdown bug (Phase 1).
- `esbDesignations[]` — **separate top-level list**, not merged into nonManagementDesignations: Director, Principal, Vice_Principal, Head_Mistress, Senior_Teacher_I/II/III, Teacher_I/II/III, Trainee_Teacher, Contract_Teacher, Supervisor
  **[Day 13 correction — important]** Prior version stated ESB/school designations were merged into `nonManagementDesignations[]`. This is **incorrect** — live Firestore confirms `esbDesignations` is its own distinct top-level list, separate from `nonManagementDesignations`. `constants.js`'s approach of keeping `ESB_DESIGNATIONS` separate was correct; the schema doc's prior explanation was wrong.
- `nonManagementDesignations[]` — Supervisor_I_S8, Supervisor_II_S7, Supervisor_III_S6, Head_Operator_S5, Senior_Operator_S4, Operator_I_S3, Operator_II_S2, Operator_III_S1 (fertilizer-plant only — no school/ESB titles, see correction above)
- `managementDesignations[]` — GMM_M13, Senior_Department_Manager_M12A, Department_Manager_M12, Unit_Manager_M11, Senior_Staff_Engineer_M11, Section_Head_M10, Staff_Engineer_M10, Senior_Engineer_M9A, Senior_Engineer_M9, Engineer_I_M8, Engineer_II_M7, Engineer_III_M6, Sr_Sub_Engineer_I_MT6, Sr_Sub_Engineer_II_MT5, Sr_Sub_Engineer_III_MT4, Sub_Engineer_I_MT3, Sub_Engineer_II_MT2, Sub_Engineer_III_MT1, GTE_M5
  **[Day 13 correction]** Prior version listed `Sr_Sub_Engineer_I_M6` (doesn't exist live — real value is `Engineer_III_M6`) and `GTE_M0` (live value is `GTE_M5`). Also confirmed: live list includes **both** `Senior_Engineer_M9A` and `Senior_Engineer_M9` as separate entries — `constants.js`'s fallback list is currently missing the M9A variant (Phase 3 item).
- `maritalStatuses[]` — married, **unmarried**, divorced, widowed
  **[Day 13 correction — confirmed real drift]** `constants.js`'s `MARITAL_STATUSES` fallback uses `'single'` instead of `'unmarried'`. This is not a doc error — it's a genuine app-code mismatch against live config (Phase 3 item).
- `units{}` — nested by department, lists equipment/machinery/section names
  **[Day 13 correction]** Prior version's example (`CIU_Equipment`, `CIU_Machinery`) does not match live data — real example under Maintenance is `OU_Equipment`, `OU_Machinery`, `NP_Equipment`, `Ammonia_Equipment`, etc. Live `units` keys also follow the same inconsistent casing as `departments[]` above (e.g. `admin` → `industrial_relations`, `horticulture`, `medical_centre`, `security`, `management_club`).

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

**[Day 13 note]** Live sample documents confirm this collection currently holds **only these fields** — no `department`, `designation`, `bloodGroup`, `cnic`, `communityGroup`, `unit`, or any of the other fields the backend (`PUT /:employeeId`) is built to accept. This is expected: no frontend screen currently collects these fields from either employee or admin (Phase 4, My Profile, addresses this gap). Backend-accepted-but-unused fields per `employeeRoutes.js`: `cnic`, `designation`, `department`, `houseNumber`, `roomNumber`, `phoneNumber`, `emergencyPhoneNumber`, `landlineExtension`, `bloodGroup`, `bloodDonorConsent`, `maritalStatus`, `townshipResidentWithFamily`, `townshipResidentBachelor`, `residenceType`, `cityOfResidence`, `communityGroup` (admin-only, set during validation).

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
| maritalStatus | string / null | mandatory 25+ per design doc — subject to same `'single'` vs `'unmarried'` drift as employees (Phase 3) |
| motherId | string / null | optional, supports multi-spouse scenarios |
| nadraCardNumber | string / null | |
| name | string | |
| pendingRevision | object / null | edit-review pattern |
| rejectionNote | string / null | |
| relation | string | "son" / "daughter" / "spouse" |
| status | string | "validated" / "pending" / "rejected" |
| updatedAt | timestamp | |

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

*Generated Day 10, corrected Day 13 from live Firestore console screenshots reviewed in session. Update this file if the schema changes — treat as a living reference, not a locked spec.*