# Phase 5 — Ambulance Flow Redesign — LOCKED DESIGN

**Status:** Design build complete, Day 21. Subphases 5.1–5.9 built and live-verified across reception, Doctor, and CMO logins. Phase 5.7 formally decided NOT to be built (see §5 and "Explicitly Not Solved By This App" below). This document remains the source of truth for what was built and why — updated in place rather than superseded, to avoid the two-files-disagreeing risk flagged in the Build Sequence section below.

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

### 1a. Emergency priority at Accept — hard rule (Day 18, resolved)

Originally left advisory: live testing (Day 17) showed reception accepting a routine request ("Q3") ahead of an already-pending emergency, which was correct per the *original* 5.4 design (the bypass only guaranteed queue position, not enforcement at Accept). Revisited and **locked as a hard rule**: reception/CMO/Doctor cannot accept any routine request while an emergency request is still sitting `pending` (not yet accepted). Enforced server-side in `ambulanceRoutes.js`'s `/accept` route — attempting to accept a routine request while an emergency is pending returns a blocking error naming the waiting emergency patient. Reordering **among routine requests** (which one gets accepted first) remains entirely at reception's discretion — this rule only fires when the request being skipped ahead of is an emergency. Live-verified Day 21 (Hanbal's emergency correctly blocked Sami's routine Accept).

### 1b. Intercity-away banner (Day 18, resolved)

When the active/dispatched trip is intercity (`tripType: intercity`), the vehicle is away for a materially longer, uncertain duration than a routine within-township trip. Two places now surface this:
- **At submission** (already existed, Step 5.6.3): the queue-position confirmation message includes an away-note when the slot is held by an intercity trip.
- **On the "My Ambulance Request" status screen** (Day 18 addition): a persistent banner alongside the queue-position line — *"Ambulance is away on an intercity trip — return time uncertain. Call the Medical Centre if this is urgent."* — derived read-only from whether the currently-blocking trip is intercity; no new field, no risk of drift from the existing `tripType` data.

## 2. Family Member Selection on Request Screens

- Both `AmbulanceRequestScreen` (employee) and `AmbulanceRequestReceptionScreen` (reception, on behalf of employee) get a **family member dropdown** to select the patient, instead of the current free-text Patient Name field.
- **Disabled/inactive family members (per Phase 4's disable flow — deceased spouse, divorced spouse, admin-disabled child) are excluded from the dropdown**, not shown greyed out. Simple exclusion, no special-casing needed.
- "Self" remains an option alongside listed family members.
- **Resolved (Day 16 build):** no further change was needed to the reception on-behalf-of search flow beyond adding the dropdown once an employee is found — no issues surfaced during 5.3 build or subsequent live testing.

## 3. Return-to-Home as Its Own Category

- Dropping a patient home after treatment at the Medical Centre is a **new, distinct trip category**, always initiated by Reception (never by the employee — they have no reason to request their own return trip).
- Lives in its **own tab/section** on the reception side, separate from the main "raise new ambulance request" flow.
- **Can be merged with a subsequent pickup** in the same physical drive when convenient — e.g., driver drops one returning patient and continues on to pick up the next queued patient in the same trip, rather than two separate round trips. This is an efficiency option, not a requirement of every return.
- Default drop-off location for this category is the employee's registered house number, editable by reception if needed (e.g., picking up somewhere other than the house).
- **Note (Day 16, build correction):** rather than a wholly separate request document, this was implemented as a status extension of the same request — `Complete Request` split into `Confirm Arrival` (vehicle freed, request stays open) and `Drop Off`/`Drop Off Not Required` (final close-out, two fixed reasons, no free text). See Step 5.6.3 in `COMMAND_BOARD.md`. Deliberately minimal — no new document, no Purpose-of-Visit re-selection.

## 4. Employee-Side Gaps — Confirmed Bugs, Not New Features

These were identified from the existing code (not the redesign) and are locked for this phase regardless of the rest of the redesign:

- **Employee cannot currently view their own submitted request.** `GET /:id` excludes the `employee` role entirely. Fix: allow an employee to view a request where `requestedBy === their own uid`. **Built (5.5) — implemented as a purpose-built `GET /my-active` endpoint rather than opening `GET /:id` to employees, since it inherently scopes to the caller's own family and needs no separate ownership check.**
- **Employee cannot cancel their own pending request.** Only reception, CMO, or the assigned driver (mid-trip) can cancel today. Fix: allow the requesting employee to cancel while status is still `pending` (i.e., before reception has accepted it — once accepted, cancellation authority moves to reception/CMO as today). **Built (5.5).**
- **No duplicate active request per patient.** An employee (or a family member on their behalf) cannot submit a second request for the *same patient* while an earlier request for that patient is still open (not yet completed/cancelled). This replaces the earlier, overly broad "can never request again after one completed request" reading — the restriction is per-patient and only while a prior request for that same patient is still active, not a lifetime limit. **Built (5.5) — matched by `employeeNumber`, not `requestedBy`, so it correctly catches reception-submitted requests too; uniform, no emergency exception, to avoid adding to reception's burden.**

## 5. Emergency Mid-Route Diversion — DECIDED NOT TO BUILD (Day 21)

This section originally described the most operationally significant piece of the redesign — what happens when an emergency comes in while the driver is already out on a routine trip with a patient boarded. **After discussion on Day 21, this was deliberately not built**, on the same "don't over-engineer for an edge case" reasoning already applied elsewhere in this design (the driver mid-route cancellation re-queue decision, the diverted trip's recorded drop location). See "Explicitly Not Solved By This App" below for the full reasoning and the accepted consequence.

The original design intent is preserved here for reference, since it explains what the accepted gap actually is:

- Driver would have been alerted immediately (in-app and/or via radio/phone call from reception).
- Driver would have decided, in the moment, whether to divert immediately or return to base first.
- The routine patient already in the vehicle would have decided, on the spot, whether to be dropped off right where the driver stops, or to be taken back to the Medical Centre.
- The interrupted routine trip would have been marked `Completed` directly, with the trip record still showing the originally intended drop location, not the actual exit point — accepted as a known minor gap in historical accuracy.
- Vehicle switching itself (Bolan ↔ Hiace) was always out of scope for the app to solve regardless of whether 5.7 was built — it requires a second driver, which doesn't exist.

**What was actually built instead (Day 18):** the driver's existing Cancel Trip action (available while `dispatched` or `picked_up`) now sends a fixed, non-editable reason — *"Diverted for another emergency call"* — matching the driver dashboard's zero-typing, graphical design (drivers have no English/typing fluency). This is the *only* reason a driver ever cancels in practice. The employee-facing cancellation notification uses a dedicated full sentence rather than the generic "Reason: X" template: *"Your ambulance request was cancelled — the vehicle was diverted for an emergency. Reception will contact you shortly."* Once cancelled, the vehicle is free and the emergency can be dispatched normally through the existing single-active-trip lock.

## 6. Notification Wording

- On dispatch, the employee's notification should read along the lines of: **"Vehicle is en route to your pickup point. Keep ready."**
- **No specific time promise** (the original "will reach in 5 minutes" framing was dropped) — same reasoning as dropping ETA in §1: a specific claim that's sometimes wrong is worse than no claim.

## 7. CMO / Doctor Ambulance Visibility — RESOLVED (Day 21), built as 5.8.1–5.8.3

- Confirmed via live screenshots: **neither the CMO home screen nor the Doctor home screen had any ambulance-related tile** prior to this phase. Genuine visibility gap, not a perception issue.
- **Audience — resolved: both CMO and Doctor, full write parity, not view-only.** Homi's reasoning: "CMO may be on leave at some time" — Doctor needs to be able to cover ambulance operations fully, not just observe them. Backend role checks on every ambulance write route (`accept`, `assign`, `dispatch`, `arrive`, `dropoff`, `cancel`) and the previously-doctor-excluded read routes (`GET /:id`, `GET /active`, `GET /on-duty-driver`) were extended to include `doctor` alongside `cmo`. Live-verified Day 21: Doctor drove a full request lifecycle (Accept → Assign & Dispatch → Confirm Arrival → Drop Off) end to end; CMO independently verified Accept and Cancel.
- **Scope — resolved: both (c).** Built as three sub-parts:
  - **5.8.1 — Live operational view.** Reuses the exact `AmbulanceReceptionHub`/`AmbulanceRequestDetail` screens reception already uses, gated by the now-widened backend permissions rather than a separate restricted UI — since the backend already grants full authority, building a second, more limited screen on top would have been UI-only theater, not real access control.
  - **5.8.2 — Historical/reporting view.** New `AmbulanceCMOHistoryScreen` — full-status filterable history (no default status restriction, unlike reception's narrower 5.9 screen) plus a Response Time KPIs panel (total requests, completed, avg response/arrival/return/total-trip time). Reused and extended the existing `reportRoutes.js` `GET /ambulance` route (per the note below) rather than a new endpoint; `GET /ambulance/kpis` extended to accept a `fromDate`/`toDate` range (previously only single-date or month/year) so both panels on the screen share one date filter instead of two inconsistent ones.
  - **5.8.3 — False-emergency flagging.** See new §7a below.
- **Confirmed before building:** the existing-but-unwired `reportRoutes.js` `/ambulance` route (flagged in Phase 10's orphaned-routes list) already covered most of what 5.8.2 needed — date range, priority filter, full request list, role gating that already included both CMO and Doctor. Extended with additive, optional query params (`status`, `employeeSearch`, `falseEmergencyOnly`) and an `acceptedByName` resolution, rather than forked into a new route — kept safe for any other future consumer of the same summary route.

### 7a. False-Emergency Flagging (5.8.3, resolved Day 18–21)

Resolves the "Reclassification" item from the original Still Open list below. Confirmed via discussion: a false-emergency judgment **cannot be made before the patient arrives**, and **should not be risked on reception's instinct mid-trip** — so rather than a live reclassification mechanism, this is captured at closure:

- A checkbox appears on the Drop Off action, **only for requests originally flagged `emergency`** (a routine request has nothing to "falsely" claim — the checkbox simply doesn't render for one).
- Checking it and completing the trip sets `falseEmergencyFlag: true`, `falseEmergencyFlaggedBy`, `falseEmergencyFlaggedAt` on the request, and sends a dedicated notification to CMO (not Doctor, not the requester) for administrative follow-up — treated as a disciplinary/administrative judgment call, not routine operational coverage.
- The flag persists visibly: a banner on the request's detail view, a filter chip ("Flagged False Emergency") and a per-row tag on the CMO/Doctor History screen (5.8.2).
- Live-verified Day 21: checkbox rendered correctly on an emergency request, hidden on routine ones, flag persisted and surfaced correctly in the History screen's filter.

## 8. Firestore Rules — Security Fix (Independent of Redesign) — BUILT (5.1)

- Confirmed during code review: the current rule `allow update: if isAnyRole(['reception', 'driver', 'doctor', 'cmo', 'employee'])` on `ambulanceRequests` let **any employee directly update any field of any ambulance request** via a direct Firestore write, bypassing all of the backend's role/state logic entirely.
- This was a pre-existing gap (not introduced by this redesign). Tightened to match the finalized backend action model, following the same pattern used in Phase 4 (field-level / role-appropriate rule restrictions, checked independently from the Express layer).
- `doctor`'s rules-layer update rights, which pre-dated any backend route actually using them, are no longer a mismatch — 5.8.1 gave doctor real backend write authority to match, so the rules and Express layers now agree.

## 9. Data-Accuracy Fix — Purpose of Visit — BUILT (5.2)

- Confirmed via live screenshots, not just code review: **"Purpose of Visit" (Emergency / Routine Consultation / Physiotherapy / Dental / Lab Sample) is captured on both request screens but never saved by the backend.** Testers have been visibly working around this by typing the purpose into the free-text Condition/Complaint field instead (e.g., "Dental Visit", "Physiotherapy visit" appearing as the "condition").
- Fix: persist `purposeOfVisit` on the request document, and surface it properly on the dispatch cards / detail screen instead of relying on it being smuggled into the complaint text.

## 10. Reception History/Filter View (5.9, Day 19, resolved)

A gap identified at design time (Day 15) but never assigned a subphase number until Day 19. Resolved scope:
- **Reception-only** — employee-side history was deliberately not built; the employee already has notifications covering this ground.
- **Standalone screen** (`AmbulanceHistoryScreen`), not folded into the CMO/Doctor dashboard (5.8) — reception's day-to-day operational history is a different audience and scope than CMO's oversight/reporting view.
- **Default scope: completed + cancelled only** (narrower than 5.8.2's CMO/Doctor screen, which shows all statuses by default) — reception's live dispatch board already covers in-progress requests, so this screen's job is specifically the closed-out history.
- Filters: date range, employee name/number search, status, priority. Columns: patient name, employee number, status, request-initiated-at, accepted-by (resolved from uid to display name).

---

## V2 Backlog Additions (Explicitly Deferred, Not This Phase)

- **GPS tracking of vehicle**, visible to reception.
- **WhatsApp integration** — automated messages to employees waiting in queue.
- **Driver-side dashboard with queue visibility and emergency auto-alert** (blinking/prominent interrupt UI) — originally noted as needing to be designed together with §5 (emergency mid-route diversion), since they were the same operational moment from two different screens. **Since §5 (Phase 5.7) was decided not to be built, this V2 item's co-design dependency no longer applies as originally framed** — if revisited in V2, it would need fresh scoping rather than picking up where this note left off, since the emergency-interrupts-active-trip mechanism it was meant to pair with turned out to be a simple fixed-reason cancellation, not a diversion UI.

---

## Explicitly Not Solved By This App

- **The one-driver, two-vehicle bottleneck itself.** Documented as an accepted operating constraint (§0), not a defect to be engineered around. The only thing the app is expected to do is make the cost of this constraint visible in the data, not eliminate it.

- **Emergency mid-route diversion (Phase 5.7) — not built.** When a driver already has a routine patient in the vehicle and receives an emergency call, the existing Cancel Trip action (single fixed reason, see §5) is used regardless of which of three real scenarios is actually happening:
  1. Driver en route to drop off a patient, gets the call, cancels, and either drops the patient midway or returns to base with them to switch vehicles.
  2. Driver en route to pick up a routine patient (not yet boarded), gets the call, cancels, returns to switch vehicles — no patient involved, cleanest case.
  3. Driver already picked up and is returning, gets the call — no issue at all; the trip completes normally through the existing flow and the driver switches vehicles after.

  The record does not distinguish between outcome (a) and (b) within scenario 1, nor capture where a mid-route patient actually ended up — this is handled entirely through the existing radio/phone channel between driver and reception, not the app. Accepted as a deliberate scope decision, consistent with the existing accepted gap on diverted trips' recorded drop location and the earlier decision not to build re-queue logic for pre-pickup emergency cancellations. The team handles this one-off scenario manually rather than the app building exception-handling for it.

- **4 AM scheduled auto-cancel of stale `pending` requests — dropped (Day 21).** Raised Day 16 as a standing safety net against stale data locking the queue. Decided not needed: reception can manually cancel any open request if required, and the operational cost of building/maintaining a Cloud Scheduler job for this wasn't justified.

- **`EmployeeHome.js` ambulance tile review — deferred, not blocking.** Will be reviewed as part of a UI pass before app publish rather than during Phase 5 itself, per Homi's call. Note: the queue-position display this item originally flagged as needing to be wired in was in fact delivered live in 5.4/5.5, so this remaining item is now purely a tile-gating/layout check, not a functional gap.

---

## Build Sequence

Build sequence and live status tracking live in `COMMAND_BOARD.md`, Phase 5 subphases 5.1–5.9 (plus 5.8.1–5.8.3) — not duplicated here, to avoid two files disagreeing about where we are (same drift risk Phase 3 found with constants files). This document stays the reference for *what and why*; the Command Board tracks *what's done and what's next*.

---

## Formerly "Still Open" — all resolved as of Day 21

- ~~A scheduled job to auto-cancel any request still sitting in `pending` at 4 AM daily~~ — **dropped**, see "Explicitly Not Solved By This App" above.
- ~~§1: Confirm the queue-position number counts all pending requests system-wide, or only those for the same vehicle type~~ — **resolved during 5.4 build:** system-wide, confirmed in `getActiveQueue()`'s comment in `ambulanceRoutes.js`.
- ~~§2: Confirm no other change is needed to the reception on-behalf-of search flow beyond adding the dropdown~~ — **resolved:** no further change needed, no issues surfaced.
- ~~§7: CMO/Doctor dashboard scope (live vs. historical vs. both)~~ — **resolved: both**, plus full write parity for Doctor. See §7 above.
- ~~Reclassification: no mechanism for reception to downgrade a false "Emergency" flag after the fact~~ — **resolved via 5.8.3**, closure-time flagging routed to CMO rather than a live reclassification tool. See §7a above.
- ~~`EmployeeHome.js` has not yet been reviewed~~ — **deferred to pre-publish UI review**, not a blocker; queue-position display itself already shipped independent of this review. See "Explicitly Not Solved By This App" above.