# Phase 5 — Ambulance Flow Redesign — LOCKED DESIGN

**Status:** Locked for build, Day 15. Reference this document during Phase 5 execution the way `PHASE4_DESIGN.md` was used for My Profile — this is the source of truth for what gets built, not a running discussion log.

**Context:** Phase 5 began as a standard gap/bug audit of the existing Ambulance module. Live testing (screenshots) plus a full discussion with Homi turned it into a near-total redesign of the operational model, informed by real-world dispatch problems (single-driver bottleneck, vehicle mismatch, customers exaggerating urgency, no visibility while waiting) and by design lessons carried over from the Servio project. This document captures everything agreed. Anything not in this document was discussed but not decided, and should not be assumed during the build.

---

## 0. Operating Reality This Design Is Built Around

- **One driver per shift, full stop.** Not one driver per vehicle — one driver, period. This is the hard constraint underneath every queue/concurrency decision below.
- **Two vehicles, functionally different:**
  - Suzuki Bolan — general-purpose seating, non-AC, within-township only. Used for routine pick/drop, lab visits, physiotherapy, dental, etc.
  - Toyota Hiace (BLS-equipped) — stretcher, attendant seating, paramedic gear. Reserved for genuine emergencies.
  - Because there's one driver, only one vehicle can be in motion at any moment regardless of type. **There is one system-wide active-trip slot, not one per vehicle.**
- **No dedicated emergency driver exists, and won't for the foreseeable future.** The vehicle-switching cost during an emergency (driver must physically return to base to swap vehicles) is an accepted, documented limitation of the current design — not something the app is expected to solve. The system's job is to make that cost *visible*, not eliminate it.
- **Driver will be equipped with radio + Android phone with live SIM.** Reception can reach the driver directly by voice, independent of the app. This means the app is not the sole real-time alerting path — it's the system of record, and a secondary alert channel, not the only lifeline.
- Walking distance between any two points in the township is a maximum of ~20 minutes. This is why a mid-route drop-off (see §5) is not considered a hardship for a routine patient.

---

## 1. Single System-Wide Queue, Emergency Bypass

- All requests — regardless of eventual vehicle (Bolan or Hiace) — enter **one queue**.
- Only one request can be in an active trip state (accepted → dispatched → picked up) at a time, system-wide.
- **Emergency requests bypass the queue entirely.** They jump straight to the front, ahead of any routine request waiting, whether or not a routine trip is currently in progress (see §5 for the in-progress interrupt case).
- Employees making a routine request see their **queue position as a plain number** ("You are #3 in queue"). No time estimate, no ETA.
  - **Decision:** ETA was discussed and deliberately dropped in favor of a queue position number. A wrong time estimate creates a new complaint; a queue number is always honest.
- **While one trip is active (any vehicle), no new dispatch can begin.** New employee requests and reception's ability to accept/assign are both held until the active trip closes — except for an emergency, which bypasses this hold per §5.
  - This resolves what were originally two separately-worded points ("no new request while one is active" and "no new dispatch once one is completed") — they are the same rule, restated from the driver's side and the request's side.

## 2. Family Member Selection on Request Screens

- Both `AmbulanceRequestScreen` (employee) and `AmbulanceRequestReceptionScreen` (reception, on behalf of employee) get a **family member dropdown** to select the patient, instead of the current free-text Patient Name field.
- **Disabled/inactive family members (per Phase 4's disable flow — deceased spouse, divorced spouse, admin-disabled child) are excluded from the dropdown**, not shown greyed out. Simple exclusion, no special-casing needed.
- "Self" remains an option alongside listed family members.

## 3. Return-to-Home as Its Own Category

- Dropping a patient home after treatment at the Medical Centre is a **new, distinct trip category**, always initiated by Reception (never by the employee — they have no reason to request their own return trip).
- Lives in its **own tab/section** on the reception side, separate from the main "raise new ambulance request" flow.
- **Can be merged with a subsequent pickup** in the same physical drive when convenient — e.g., driver drops one returning patient and continues on to pick up the next queued patient in the same trip, rather than two separate round trips. This is an efficiency option, not a requirement of every return.
- Default drop-off location for this category is the employee's registered house number, editable by reception if needed (e.g., picking up somewhere other than the house).

## 4. Employee-Side Gaps — Confirmed Bugs, Not New Features

These were identified from the existing code (not the redesign) and are locked for this phase regardless of the rest of the redesign:

- **Employee cannot currently view their own submitted request.** `GET /:id` excludes the `employee` role entirely. Fix: allow an employee to view a request where `requestedBy === their own uid`.
- **Employee cannot cancel their own pending request.** Only reception, CMO, or the assigned driver (mid-trip) can cancel today. Fix: allow the requesting employee to cancel while status is still `pending` (i.e., before reception has accepted it — once accepted, cancellation authority moves to reception/CMO as today).
- **No duplicate active request per patient.** An employee (or a family member on their behalf) cannot submit a second request for the *same patient* while an earlier request for that patient is still open (not yet completed/cancelled). This replaces the earlier, overly broad "can never request again after one completed request" reading — the restriction is per-patient and only while a prior request for that same patient is still active, not a lifetime limit.

## 5. Emergency Mid-Route Diversion

This is the most operationally significant piece of the redesign. It governs what happens when an emergency comes in while the driver is already out on a routine trip.

- **Driver is alerted immediately** (in-app and/or via radio/phone call from reception — the app is not assumed to be the only alert path).
- **Driver decides, in the moment, whether to divert immediately or return to base first**, based on where he physically is relative to the emergency and to base.
- **The routine patient already in the vehicle decides, on the spot, whether to be dropped off right where the driver stops, or to be taken back to the Medical Centre** — whichever is more convenient for them in that moment. This decision belongs to the patient, not to reception or the driver, so there is no approval delay eating into emergency response time.
- **A boarded routine patient does not get to insist on being dropped at their original destination first.** Mid-route diversion takes priority once an emergency is confirmed.
- **The interrupted routine trip is marked `Completed` directly** — no new "diverted" or "interrupted" status is introduced. This was a deliberate decision **not to over-engineer** the status model: since a mid-route drop-off is not considered a hardship for the customer (20-minute max walking distance across the township), treating it as a normal completion is accurate enough. The trip record will still show the originally intended drop location, not the actual exit point — this is a known, accepted minor gap in historical accuracy, not something worth a new field for.
- **Mechanical consequence:** `Complete` currently requires status `returned` (vehicle physically back at base) before it can be triggered. Since a diverted trip skips returning to base, **reception must be able to mark a trip `Complete` directly from `picked_up`**, not only from `returned`. This is a small, scoped change to an existing action's allowed-from states — not a new status.
- **Vehicle switching itself (Bolan ↔ Hiace) is explicitly out of scope for this app to solve.** It requires a second driver, which doesn't exist. The system's role is to make the cost of that switch visible in the data (see §8), not to eliminate it.

## 6. Notification Wording

- On dispatch, the employee's notification should read along the lines of: **"Vehicle is en route to your pickup point. Keep ready."**
- **No specific time promise** (the original "will reach in 5 minutes" framing was dropped) — same reasoning as dropping ETA in §1: a specific claim that's sometimes wrong is worse than no claim.

## 7. CMO / Doctor Ambulance Visibility

- Confirmed via live screenshots: **neither the CMO home screen nor the Doctor home screen has any ambulance-related tile today.** This is a genuine visibility gap, not a perception issue.
- A tile + dashboard is required for CMO (and likely Doctor, to be confirmed) to see ambulance operations.
- **Scope not yet decided** — needs to be defined as one of:
  - a) a live operational view (mirroring Reception's dispatch board — what's active right now), or
  - b) a historical/reporting view (trip counts, emergency frequency, diversion frequency), or
  - c) both.
- Before building new report logic from scratch: check what the existing-but-unwired backend route `reportRoutes.js` `/ambulance` (flagged in Phase 10's list of five orphaned report routes) already calculates — it may already cover part of this need.

## 8. Firestore Rules — Security Fix (Independent of Redesign)

- Confirmed during code review: the current rule `allow update: if isAnyRole(['reception', 'driver', 'doctor', 'cmo', 'employee'])` on `ambulanceRequests` lets **any employee directly update any field of any ambulance request** via a direct Firestore write, bypassing all of the backend's role/state logic entirely.
- This is a pre-existing gap (not introduced by this redesign) and should be tightened to match whatever the finalized backend action model becomes — following the same pattern used in Phase 4 (field-level / role-appropriate rule restrictions, checked independently from the Express layer).
- `doctor` currently has update rights in the rules but no backend route ever exercises a doctor action on an ambulance request — confirm during build whether doctor needs any write access at all, or whether this was leftover from an earlier design.

## 9. Data-Accuracy Fix — Purpose of Visit

- Confirmed via live screenshots, not just code review: **"Purpose of Visit" (Emergency / Routine Consultation / Physiotherapy / Dental / Lab Sample) is captured on both request screens but never saved by the backend.** Testers have been visibly working around this by typing the purpose into the free-text Condition/Complaint field instead (e.g., "Dental Visit", "Physiotherapy visit" appearing as the "condition").
- Fix: persist `purposeOfVisit` on the request document, and surface it properly on the dispatch cards / detail screen instead of relying on it being smuggled into the complaint text.

---

## V2 Backlog Additions (Explicitly Deferred, Not This Phase)

- **GPS tracking of vehicle**, visible to reception.
- **WhatsApp integration** — automated messages to employees waiting in queue.
- **Driver-side dashboard** with queue visibility and emergency auto-alert (blinking/prominent interrupt UI). Design deferred until the employee-side and reception-side pieces above are built and live-verified working. When this is designed, it must be designed together with §5 (emergency diversion), since they are the same operational moment from two different screens.

---

## Explicitly Not Solved By This App

- The one-driver, two-vehicle bottleneck itself. Documented as an accepted operating constraint (§0), not a defect to be engineered around. The only thing the app is expected to do is make the cost of this constraint visible in the data, not eliminate it.

---

## Build Sequence

Build sequence and live status tracking live in `COMMAND_BOARD.md`, Phase 5 subphases 5.1–5.8 — not duplicated here, to avoid two files disagreeing about where we are (same drift risk Phase 3 found with constants files). This document stays the reference for *what and why*; the Command Board tracks *what's done and what's next*.

---

## Still Open — Needs a Decision Before or During Build

- **Day 16, raised during 5.4 build:** A scheduled job to auto-cancel any request still sitting in `pending` at 4 AM daily, as a standing safety net against stale data locking the queue (distinct from the one-time cleanup already done before 5.4 deployed). Logged for later analysis — not built, may be dropped after review. Would need its own design pass (a Cloud Scheduler + Function, not touched by anything in 5.1–5.8) before being added to the sequence.

- **§1:** Confirm the queue-position number counts *all* pending requests system-wide, or only those for the same vehicle type the request would eventually need (given §0, it should be the former — but state it explicitly in the backend logic comment when built).
- **§2:** Confirm no other change is needed to the reception on-behalf-of search flow beyond adding the dropdown once an employee is found.
- **§7:** CMO/Doctor dashboard scope (live vs. historical vs. both) — pick one before wireframing.
- **Reclassification:** No mechanism currently exists for reception to downgrade a false "Emergency" flag or upgrade an under-reported routine one after the fact. Raised during discussion but not explicitly resolved — confirm whether this is needed for V1 or can wait.
- **`EmployeeHome.js` has not yet been reviewed.** Needed before build to see current ambulance tile gating (if any) and to wire in the queue-position display.