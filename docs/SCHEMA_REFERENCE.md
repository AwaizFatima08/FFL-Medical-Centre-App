# FFL Medical Centre — Firestore Schema Reference

Generated from live production data review (Day 10 audit). This reflects the **actual** schema as observed in Firestore, not the planned schema — treat this as ground truth over any prior planning notes if they conflict.

---

## Top-Level Collections

`ambulanceRequests` · `circulars` · `config` · `doctorAvailability` · `doctorDirectory` · `employees` · `familyMembers` · `feedback` · `fitnessAppointments` · `mail` · `notifications` · `tripBookings` · `users` · `vaccinationRecords` · `vaccinationReports` · `vaccineSchedule`

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
| status | string | "cancelled" / etc. |
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

Single document holding shared dropdown option lists. Structure observed:
- `bloodGroups[]` — A+, A-, B+, B-, AB+, AB-, O+, O-
- `departments[]` — admin, maintenance, BD, DSN, ASM, HSEQT, IT, Production_S, Production_N, Process_Engineering, Project_Engineering, ESB, HO_IT, HO_HR, HO_Marketing, HO_Finance, HO_Internal_Audit, HO_SCF
- `employeeTypes[]` — management, non_management, CSD
- `nonManagementDesignations[]` — includes both fertilizer-plant and FFL Education Society designations (e.g. Principal, Vice Principal, Head Mistress, Senior Teacher I/II/III, Teacher I/II/III, Trainee/Contract Teacher, Supervisor) — Medical Centre serves both FFL and FFL Education Society employees, so this is expected, not an error
- `managementDesignations[]` — GMM_M13, Senior_Department_Manager_M12A, Department_Manager_M12, Unit_Manager_M11, Senior_Staff_Engineer_M11, Section_Head_M10, Staff_Engineer_M10, Senior_Engineer_M9A, Senior_Engineer_M9, Engineer_I_M8, Engineer_II_M7, Sr_Sub_Engineer_I_M6, Sr_Sub_Engineer_II_M5, Sr_Sub_Engineer_III_M4, Sub_Engineer_I_M3, Sub_Engineer_II_M2, Sub_Engineer_III_M1, GTE_M0
- `maritalStatuses[]` — married, unmarried, divorced, widowed
- `units{}` — nested by department, lists equipment/machinery/section names (e.g. Maintenance → CIU_Equipment, CIU_Machinery, NP_Equipment, Ammonia_Equipment, Urea_Equipment, ...)

## doctorAvailability

| Field | Type | Notes |
|---|---|---|
| currentStatus | string | "available" |
| fullName | string | |
| isAvailable | boolean | |
| updatedAt | timestamp | |
| updatedBy | string (uid) | |

Subcollection: `statusLog` (referenced in design doc, not expanded in screenshot).

## doctorDirectory

| Field | Type | Notes |
|---|---|---|
| address | string | |
| city | string | |
| createdAt | timestamp | |
| createdBy | string (uid) | |
| hospital | string | |
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
| maritalStatus | string / null | mandatory 25+ per design doc |
| motherId | string / null | optional, supports multi-spouse scenarios |
| nadraCardNumber | string / null | |
| name | string | |
| pendingRevision | object / null | edit-review pattern |
| rejectionNote | string / null | |
| relation | string | "son" / "daughter" / "spouse" |
| status | string | "validated" |
| updatedAt | timestamp | |

## feedback

| Field | Type | Notes |
|---|---|---|
| booleans.bedLinenClean | boolean | |
| booleans.doctorGaveAmpleTime | boolean | |
| booleans.doctorUnderstoodProblem | boolean | |
| booleans.nursingBehaviour | boolean | |
| consultingDoctorId | string | |
| employeeId | string | literal placeholder text seen in sample — verify real submissions populate actual uid |
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
| doctorId / doctorName | string | snapshot at booking time (Option A) |
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

## vaccinationReports

| Field | Type | Notes |
|---|---|---|
| generatedAt | timestamp | |
| missed | number | |
| upcoming | number | |
| url | string | Storage URL to weekly PDF |
| weekEnd / weekStart | timestamp | |

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

---

*Generated Day 10, from live Firestore screenshots reviewed in session. Update this file if the schema changes — treat as a living reference, not a locked spec.*
