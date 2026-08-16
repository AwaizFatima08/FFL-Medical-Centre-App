# FFL Medical Centre App — Master Design Document
**Version:** 1.0 — Post V1 Launch  
**Date:** August 2026  
**Author:** Dr. Humayun Shahzad (CMO, Fatima Fertilizer Company)  
**Developed by:** HomiLabs (Awaiz Fatima, Muhammad Abdulhadi, Parishay Zainab)

---

## 1. PROJECT OVERVIEW

A React Native / Expo application digitising medical centre operations for FFL township employees and their families. Built as a personal hobby and family learning project — not officially commissioned by IT. Circulated for voluntary installation. No FFL branding constraints apply; app is generic enough for adoption by any similar organisation.

**Web:** https://ffl-medical-centre-app.web.app  
**Firebase Project:** ffl-medical-centre-app  
**GitHub:** AwaizFatima08/FFL-Medical-Centre-App (private)  
**NAS Path:** /mnt/storage/projects/ffl-medical-centre/  
**Backend Path:** functions/src/  
**Frontend Path:** app/src/  

---

## 2. INFRASTRUCTURE

| Component | Detail |
|---|---|
| Frontend | React Native / Expo (single codebase — web + Android) |
| Backend | Firebase Cloud Functions (Node.js, v2 syntax) |
| Database | Firestore |
| Auth | Firebase Authentication (email + password) |
| Storage | Firebase Storage |
| Push Notifications | FCM (Firebase Cloud Messaging) |
| Hosting | Firebase Hosting (web version) |
| Android Build | EAS Build (preview profile, buildType: apk) |
| Dev Server | Homi-NAS (Debian 12, IP 192.168.1.30) |
| VS Code | VS Code Server at port 8080 |
| Expo Dev | Port 8081 |
| Cloud Region | asia-south1 (Mumbai) |
| EAS Owner | homi55 |
| EAS Project ID | 08248d2b-896d-42c5-af2a-11be3b36b2f9 |
| Android Package | com.fatimafertilizer.medicalcentre |

---

## 3. ROLES

| Role | Access Level | Primary Device |
|---|---|---|
| employee | Own data, booking, ambulance request, feedback | Android APK |
| reception | Trip management, ambulance dispatch hub, reports | Web browser |
| driver | Trip assignments, ambulance status updates | Android APK |
| doctor | Patient views, fitness completion, reports | Android APK or web |
| nurse | Vaccination flow (V2), circulars | Android APK |
| lab_technologist | Lab results (V2) | Android APK |
| pharmacy_incharge | Pharmacy updates (V2) | Android APK |
| admin_incharge | User approval, employee management, reports | Web browser |
| cmo | Full access, all reports, CMO-only views | Web browser |

---

## 4. KEY PEOPLE

| Person | Role in System |
|---|---|
| Dr. Humayun Shahzad | CMO — project owner and developer |
| Dr. Muhammad Jamil Ur Rehman | Medical Executive — added as doctor in Firestore |
| Dr. Qudsia Andleeb | Associate Medical Executive — added as doctor in Firestore |
| Zulaikha Yameen | In-charge Nurse — designated vaccination nurse |

---

## 5. NINE FLOWS — V1 STATUS

### Flow 1 — Ambulance Dispatch ✅ Complete
- Employee submits request with patient name, relation, condition, purpose of visit
- Drop location always FFL Medical Centre (hardcoded)
- Trip type always intra_township for employee
- Reception hub manages dispatch, vehicle assignment, status updates
- Driver receives and updates status
- Notifications trigger at key events
- Priority flag: emergency vs routine (driven by purpose of visit)

### Flow 2 — Child Vaccination ⏳ V2
- Family module complete (prerequisite met)
- Vaccination schedule: 22 doses birth to 54 months (Firestore-driven, CMO-editable)
- Designated nurse: Zulaikha Yameen
- Backlog entry via nurse toggle (bypasses auto-recalculation)
- Weekly PDF report generated Fridays 7am PKT (in-app download only)
- Deferred to V2 to allow child data to populate in the field
- VaccinationAdministerScreen built but deferred
- Nurse role remains active (circulars, notifications, directory still accessible)

### Flow 3 — Health Awareness Circulars ✅ Complete
- Admin/CMO publishes circulars
- Targeted by role scope
- All roles receive and view

### Flow 4 — Medical Trip Booking ✅ Complete
- Trips: Monday, Wednesday, Saturday
- Departure: 17:30 / Return: 21:00 from RYK
- 24 seats (app-managed)
- Employee books → Reception confirms → Driver executes
- Hospital field saved at booking time (snapshot — Option A)
- Chip-based date selector (superior to date picker for this flow)
- Trip day report generated at 16:00 (PDF for driver, in-app for CMO/doctor)
- Monthly consolidation report (CMO only)

### Flow 5 — Doctor Directory ✅ Complete
- Admin-managed listing
- Fields: name, speciality, hospital, address, phone, availability
- Feeds trip booking flow (doctor/hospital selection)
- Read-only for all non-admin roles
- Searchable by speciality

### Flow 6 — Unified Notification System ✅ Complete
**Triggers locked:**
| Flow | Event | Recipient |
|---|---|---|
| Trip | Booking confirmed | Employee |
| Trip | Booking cancelled | Employee |
| Ambulance | Dispatch initiated | Employee |
| Ambulance | Driver arrived at pickup | Reception |
| Ambulance | Returned to centre | Reception |
| Ambulance | Cancelled | Employee |
| Circular | New circular published | All targeted roles |
| Fitness | Appointment assigned | Employee |
| Fitness | Reschedule approved | Employee |
| Fitness | Reschedule rejected | Employee |
| Vaccination | Appointment booked | Parent/employee (V2) |
| Vaccination | Rescheduled | Parent/employee (V2) |
| Vaccination | Administered | Parent/employee (V2) |
| Vaccination | Reminder — 1 day before | Parent/employee (V2) |
| Vaccination | Reminder — on the day | Parent/employee (V2) |

**Deferred to V2:** Pharmacy (medicine ready / not arranged) and Lab (reports ready) notifications — no pharmacy or lab flow exists in V1.

### Flow 7 — Annual Medical Fitness Appointments ✅ Complete
- Admin/CMO schedules appointments by employee number lookup
- Employee notified → can request reschedule with reason
- Admin approves (sets new date) or rejects (original date stands)
- One pending reschedule request at a time per employee
- Doctor/CMO marks examination complete with fitness outcome: Fit / Unfit / Fit with Restrictions
- Role-aware action buttons

### Flow 8 — Doctor Availability Status ✅ Complete
- Three states: Available / Not Available / On Leave
- Only reception and admin_incharge can toggle
- All other roles including doctors and CMO: read-only
- Status log maintained in Firestore subcollection

### Flow 9 — Patient Feedback ✅ Complete
- Purpose of Visit field (same options as ambulance flow)
- Three mandatory star ratings: staff behaviour, waiting time, housekeeping
- Services checklist with per-service ratings and Yes/No boolean questions
- Optional comments
- CMO sees submitter identity, admin sees all except submitter name
- CMO can delete feedback

---

## 6. ADDITIONAL V1 FEATURES

### Family Module ✅ Complete
- Collection: `familyMembers` (top-level, not subcollection)
- Relations: Spouse, Son, Daughter only
- `motherId` optional on child documents (supports multiple-spouse / deceased-spouse scenarios)
- Spouse-first gate removed
- CNIC mandatory at age 18+
- NADRA smart card optional under 18
- Marital and employment status mandatory for dependents aged 25+
- Employee edits create `pendingRevision` alongside live record (admin approves)
- Admin deactivation only — no employee delete
- Silent admin notification when dependent turns 25

### Blood Donor Directory ✅ Complete
- Read-only, searchable by blood group
- Visible to all roles
- Donor consent flag per employee

### Report Screens ✅ Complete (7 screens)
| Screen | Endpoint | Roles | Format |
|---|---|---|---|
| ReportsHubScreen | — | role-filtered | navigation |
| TripDayReportScreen | GET /trip-day | reception, cmo, doctor | JSON + PDF |
| TripMonthlyReportScreen | GET /trips/monthly | cmo | JSON |
| AmbulanceKPIReportScreen | GET /ambulance/kpis | cmo | JSON |
| PopulationReportScreen | GET /population/township or non-township | cmo | JSON + PDF |
| EmployeeOnlyReportScreen | GET /population/employees-only | cmo | JSON + PDF |
| BloodGroupReportScreen | GET /blood-groups/csv | admin, cmo | JSON + CSV |

**Security:** All downloads use Authorization header blob download (`downloadFile.js` utility). Token never appears in URL.

### User Approval Flow ✅ Complete
- Admin sees pending registrations with badge count
- Manual identity verification by phone call (admin/CMO know all employees personally)
- Approve assigns role, activates account
- Reject deletes Firebase Auth account and both Firestore documents

---

## 7. FIRESTORE COLLECTIONS

| Collection | Subcollections | Notes |
|---|---|---|
| users | — | Auth-linked, isActive, role |
| employees | — | Profile, residence, employment details |
| familyMembers | — | Top-level, linked via employeeId |
| ambulanceRequests | — | Full lifecycle with timestamps |
| medicalTrips | bookings | Trip dates, seat management |
| vaccinationRecords | — | Per-child per-dose (V2) |
| vaccineSchedule | — | Firestore-driven, CMO-editable (V2) |
| notifications | — | Per-user, isRead flag |
| doctorAvailability | statusLog | Per-doctor status |
| fitnessAppointments | — | Full lifecycle |
| doctorsDirectory | — | Admin-managed |
| feedback | — | Full form data |
| config | dropdowns | Organisational dropdown values |

---

## 8. BACKEND — CLOUD FUNCTIONS

**Deployed to:** asia-south1  
**Syntax:** Firebase Functions v2  
**Pattern:** Express routers, CommonJS (require/module.exports)  
**Utilities:** successResponse / errorResponse pattern  
**API config:** All endpoints centralised in `app/src/config/api.js`

**Route groups deployed:**
- auth (register, approve, reject, pending-users)
- employees (profile, lookup)
- ambulance (request, dispatch, status updates)
- trips (book, confirm, cancel, list, day report)
- directory (list, add, edit, delete)
- circulars (publish, list)
- fitness (schedule, reschedule, complete, cancel)
- availability (get, toggle)
- feedback (submit, list, detail, delete)
- reports (trip-day, trips/monthly, ambulance/kpis, population/township, population/non-township, population/employees-only, blood-groups/csv)
- notifications (list, mark-read)

---

## 9. FRONTEND ARCHITECTURE

**Key components:**
- `DatePickerField` — reusable date picker (app/src/components/)
- `NotificationBell` — reusable bell with badge (app/src/components/)
- `downloadFile.js` — secure blob download utility (app/src/utils/)
- `webAlert.js` / `webConfirm.js` — web-compatible alert utilities
- `storage.js` — Platform.OS-conditional storage (SecureStore on native, localStorage on web)
- `api.js` — centralised endpoint configuration

**Navigation:** AppNavigator with role-based routing. All 9 role home screens built.

**Screens by folder:**
- auth: Login, Signup (3-step), ForgotPassword
- home: 9 role-specific home screens
- admin: UserApprovalScreen
- ambulance: AmbulanceRequestScreen, AmbulanceReceptionHubScreen, DriverScreen
- availability: DoctorAvailabilityScreen
- circulars: CircularsScreen, CircularDetailScreen
- directory: DoctorDirectoryScreen
- donors: BloodDonorDirectoryScreen
- family: FamilyMemberListScreen, FamilyMemberAddScreen, FamilyMemberEditScreen, FamilyAdminReviewScreen
- feedback: FeedbackFormScreen, FeedbackListScreen, FeedbackDetailScreen
- fitness: FitnessAdminScreen, FitnessEmployeeScreen
- notifications: NotificationsScreen
- reports: ReportsHubScreen + 6 report screens
- trip: TripBookingScreen, TripReceptionHubScreen, TripDriverScreen
- vaccination: VaccinationChildListScreen, VaccinationChildDetailScreen, VaccinationAdministerScreen (V2)

---

## 10. KEY TECHNICAL DECISIONS LOCKED

| Decision | Choice | Reason |
|---|---|---|
| Date state type | JavaScript Date object | Consistent with DatePickerField |
| Date format to backend | YYYY-MM-DD string via .toISOString().split('T')[0] | Backend expects string |
| Firestore timestamp pre-fill | .toDate() conversion | Firestore Timestamp → JS Date |
| Token in downloads | Never in URL — Authorization header only | Security |
| Mobile downloads | Alert informing web-only for V1 | V2: react-native-blob-util |
| useFocusEffect vs useEffect | useFocusEffect for navigation refresh | useEffect unreliable on web |
| Firebase load-time calls | Never at module load — always inside functions | Prevents app/no-app crash |
| Date string parsing | Never use new Date('YYYY-MM-DD') — use split('-').map(Number) | Avoids PKT timezone shift |
| Alert on web | webAlert / webConfirm utilities | window.alert blocks thread |
| Employee number format | PREFIX-00000 where PREFIX is FFL/ESB/OSL/FAS | Mandatory prefix, no skip |
| Family member edits | pendingRevision pattern — live record unchanged until approved | Data integrity |
| Signup email | Personal email (not company domain) | IT constraint |
| Account approval | Manual phone verification by admin/CMO | No automated validation needed |

---

## 11. KNOWN ISSUES & DEFERRED ITEMS

### Confirmed bugs at V1 freeze (pending field test results):
- Notification generation intermittent — deferred to post-field-test

### V2 Scope (logged):
1. Child vaccination administer screen (VaccinationAdministerScreen)
2. Catch-up vaccination (nurse-driven, interval validation only)
3. Adult vaccination (Hep B 3-shot series, HPV for females)
4. Guest / non-entitled resident relatives flow
5. Dynamic medicines-not-covered list (admin-managed, auto claim deduction)
6. Employee voluntary location sharing on trip day (time-bound, auto-stops on pickup)
7. Mobile blob downloads (react-native-blob-util)
8. Pharmacy notifications (medicine ready / not arranged)
9. Lab notifications (reports ready)
10. Google Sign-In option

### Planned spin-off apps (post-V1 exploration):
- Doctor directory as standalone app (PMDC verification model, RYK-focused)
- Muhafiz (future app — family module data feeds this)

---

## 12. BACKUP STRUCTURE

### Three-layer backup (to be established):

**Layer 1 — Local timestamped backup on NAS:**
```
/mnt/storage/project_backups/ffl-medical-centre/
  YYYYMMDD-HHMM/
    app/        (frontend)
    functions/  (backend)
```
Command:
```bash
mkdir -p /mnt/storage/project_backups/ffl-medical-centre
cp -r /mnt/storage/projects/ffl-medical-centre \
  /mnt/storage/project_backups/ffl-medical-centre/$(date +%Y%m%d-%H%M)
```

**Layer 2 — Google Drive via rclone:**
Remote: gdrive  
Target: gdrive:homi-nas-projects/ffl-medical-centre  
Drive folder ID: 1dIpHwIeba2sVsd3jDsBL7ddOHCBXg4r9  
Command:
```bash
rclone sync /mnt/storage/projects/ffl-medical-centre/app \
  gdrive:homi-nas-projects/ffl-medical-centre \
  --exclude "node_modules/**" \
  --exclude ".expo/**" \
  --exclude ".git/**"
```

**Layer 3 — Git (GitHub):**
Repo: AwaizFatima08/FFL-Medical-Centre-App (private)  
Command:
```bash
cd /mnt/storage/projects/ffl-medical-centre/app
git add -A
git commit -m "Session note: description of changes"
git push
```

### Standard end-of-session backup routine (all three layers):
```bash
# Layer 3 — Git first
cd /mnt/storage/projects/ffl-medical-centre/app
git add -A
git commit -m "Session: description"
git push

# Layer 1 — Local
mkdir -p /mnt/storage/project_backups/ffl-medical-centre
cp -r /mnt/storage/projects/ffl-medical-centre \
  /mnt/storage/project_backups/ffl-medical-centre/$(date +%Y%m%d-%H%M)

# Layer 2 — Google Drive
rclone sync /mnt/storage/projects/ffl-medical-centre/app \
  gdrive:homi-nas-projects/ffl-medical-centre \
  --exclude "node_modules/**" \
  --exclude ".expo/**" \
  --exclude ".git/**"
```

---

## 13. BUILD & DEPLOYMENT

### Web (Firebase Hosting):
```bash
cd /mnt/storage/projects/ffl-medical-centre/app
rm -rf dist
npx expo export --platform web
cd /mnt/storage/projects/ffl-medical-centre
firebase deploy --only hosting
```
Note: `firebase deploy` must run from project root where `firebase.json` lives.

### Android APK (EAS Build):
```bash
cd /mnt/storage/projects/ffl-medical-centre/app
eas build --platform android --profile preview
```
Profile: preview → distribution: internal, buildType: apk  
EAS manages signing automatically for internal distribution.

### Backend (Cloud Functions):
```bash
cd /mnt/storage/projects/ffl-medical-centre/functions
firebase deploy --only functions          # all functions
firebase deploy --only functions:auth     # targeted deploy
firebase functions:log --only auth        # logs (no --limit flag in this CLI)
```

---

## 14. DEVELOPMENT PRINCIPLES

- Pre-build discussion first — architecture locked before any code written
- Complete replacement files over partial diffs for extensive changes
- Surgical changes for minor fixes
- Verify with grep before and after changes
- Test on Expo web first, EAS APK only after web is stable
- End every session with three-layer backup
- Flag scope creep explicitly — log to V2 backlog rather than absorbing
- One bug at a time — diagnose with exact file paths and line numbers
- camelCase throughout codebase
- Never store tokens in URLs
- Never call Firebase services at module load time
