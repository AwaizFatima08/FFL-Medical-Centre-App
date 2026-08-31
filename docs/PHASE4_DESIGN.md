# Phase 4 — My Profile: Design Doc

**Status:** Discussion complete, awaiting your review before build starts.
**Purpose:** Single reference for every decision made in the Day 14 Phase 4 discussion, so nothing gets lost or silently dropped when we move to code. Correct anything below that doesn't match your intent — this doc reflects what was agreed, not a fixed plan.

---

## 1. What problem this solves

Employees currently have no way to record department, unit, designation, blood group, CNIC, marital status, blood donor consent, or chronic disease — the backend accepts these fields but no screen collects them. My Profile closes this gap.

**Guiding principle throughout this design:** the medical centre already holds most of this data (HR records). The employee shouldn't have to re-type what the organisation already knows — their job is mainly to confirm and to add what only they know (family members, consent).

---

## 2. Who owns each field

| Field | Entered by | When | Editable later? |
|---|---|---|---|
| CNIC | Employee | At signup | **Locked after signup** — treated like admin-owned data; employee cannot self-edit, admin corrects if wrong |
| Marital status | Employee | At signup | **Yes, employee can self-edit anytime** — low-stakes status flag, no admin approval needed. Also auto-updated by the system in specific cases (see §6) |
| Department, Unit, Designation, Employee Type | Admin | During account approval | Admin-owned going forward |
| Blood group | Admin | During account approval | Admin-owned going forward |
| Chronic disease | Admin (if on file) | During account approval | Admin-owned going forward; admin/CMO-visible only |
| Blood donor consent | Employee | Confirmation step, post-approval | Employee can change later (opt in/out) |
| Profile picture | Employee | Optional, anytime | Deferred — no urgency, own sub-session later, **not part of signup** |
| Family members (spouse/children) | Employee | Anytime, optional | Employee adds/edits; admin can validate or flag |

**Decided:** admin picks the disable reason (Deceased / Divorced) in the same action as disabling the spouse record — one step, not two.

---

## 3. Signup changes

Signup now additionally collects:
- CNIC
- Marital status

**Flagged risk:** Phase 1 already closed and tested the signup flow. Reopening it to add these two fields means re-testing that flow end-to-end before considering it stable again — not a reason to avoid it, just a cost to budget for.

Profile picture will **not** be added to signup — deferred entirely, no value at first use, avoids reopening the camera/Storage complexity too early.

---

## 4. Admin approval step

When admin approves a new employee's account (same action that already sets `isValidated` and `communityGroup`), admin **also** fills in, in the same step:
- Department
- Unit
- Designation
- Employee Type (Management / Non-Management / ESB)
- Blood group
- Chronic disease (if known)

**Decided:** no strong preference between doing this in the same screen/action as account approval versus a separate one — build whichever is simpler once `UserApprovalScreen.js` is seen.

---

## 5. Employee confirmation, post-approval

On first login after approval, employee sees:
1. A one-time greeting: *"Your account has been validated — welcome!"*
2. The data admin entered, shown for review
3. Two checkboxes to confirm:
   - "I confirm the data above is correct"
   - Blood donor consent (opt in/out)

**If something is wrong:** no in-app dispute mechanism — employee contacts admin directly outside the app (this is a small, closed community; not worth building extra machinery for something rare).

---

## 6. Marital status — self-edit and system rules

- Employee can change their own marital status anytime via My Profile (no approval needed).
- **Live values only** (per Phase 3 lock): `married`, `unmarried`, `divorced`, `widowed`. ("Single" is not a valid value — corrected during this discussion.)
- Changing status to `married` immediately puts the Family tab into **alert state** (see §7) if no family members exist yet.

**Spouse disable flow (death or divorce):**
- Admin disables the spouse's family record and selects a reason: **Deceased** or **Divorced**.
- If **Deceased** → employee's marital status auto-updates to `widowed`.
- If **Divorced** → employee's marital status auto-updates to `divorced`.
- No grief-related messaging shown to the employee — this happens quietly in the background.

**Child disable flow (death):**
- Admin disables that specific family member only. No auto-status-change on the employee record (marital status is unaffected by a child's status).

**Explicit scope boundary — read before touching any family-member status logic:**
FFL Medical Centre App is a **data capture tool only**. It does not track or enforce medical *entitlement* — whether a family member is still eligible for benefits due to age (children lose entitlement at 25 per FFL policy), marriage, or employment is decided and enforced elsewhere (HR systems, CloudClinik), not here. This app should **never** auto-disable a family member for turning 25, getting married, or starting a job. The only disable actions this app performs are the manual, admin-triggered ones already described above (spouse: Deceased/Divorced; child: death) — nothing date-driven, nothing automatic based on age or life events other than death.

**Deliberately excluded fields — not oversights, do not add without a fresh conversation:**
- **Parents** — not part of the Family module. Only `spouse`, `son`, `daughter` are supported relations. Parents aren't part of FFL's medical entitlement structure, so there's no value in capturing them here.
- **Religion** — deliberately not captured anywhere in My Profile or Family. The employee population is ~99% one religion with a very small number of individuals from other religions — adding a religion field would make those few people trivially identifiable in any list or report. Left out as a privacy decision, not an incomplete one.

---

## 7. Family tab — visual state machine

**One rule governs all cases:**

> The Family tab is **active** whenever the employee currently has at least one active family member, **or** their marital status is `married` (even with zero members — that's the alert state).

This single rule naturally covers every scenario discussed:

| Scenario | Result |
|---|---|
| Married, no family members yet | Active, **alert state** (colour change + "?") |
| Married, spouse + children added and admin-validated | Active, **normal state** |
| Spouse disabled (widowed/divorced), children remain | Still active — children are still active members |
| Spouse disabled, no children | Tab **deactivates** — no active members, not married |
| A child dies, admin disables that record | If it was the last active member and status isn't `married` → tab deactivates. Otherwise stays active. |
| Unmarried employee, always | Tab stays in normal/inactive state — never shows the alert |

**Alert → normal transition:** the tile only returns to normal once **admin explicitly marks the family data as complete** — not automatically the moment the employee submits a family member. This is a new, admin-controlled status on the employee record (see §9), separate from each individual family member's own `pending/validated/rejected` status.

**Admin manual re-flag:** admin can re-trigger the alert state at any time (e.g. HR informs medical centre of a new birth the employee hasn't logged yet), and may attach a **short optional note** so the employee knows what's expected (e.g. *"please add your newborn"*).

---

## 8. Screens needed

1. **My Profile (employee-facing)** — shows admin-entered data + the two confirmation checkboxes; allows self-editing marital status anytime after.
2. **Employee approval / data-entry (admin-facing)** — likely extends the existing `UserApprovalScreen.js` rather than a new screen; needs confirmation.
3. **Family tab alert logic** — likely lives wherever the Family tile is rendered today (Home screen or `FamilyMemberListScreen.js` — not yet seen).
4. **Admin family-completeness control** — a way for admin to mark family data "complete" (clears alert) and to manually re-flag with a note.
5. **Spouse/child disable flow (admin)** — disable a family member with a reason (Deceased/Divorced for spouse), triggering the marital-status auto-update.

---

## 9. New data fields required (not yet in schema)

On the **`employees`** document:
- `employeeType` — `management` / `non_management` / `ESB` (admin-set)
- `chronicDisease` — admin/CMO-visible only
- `dataConfirmedByEmployee` — boolean, set true when employee ticks the accuracy checkbox
- `familyDataStatus` — e.g. `not_applicable` / `needs_update` / `pending_admin_review` / `complete`
- `familyDataFlagNote` — optional short text, set when admin manually re-flags

On the **`familyMembers`** document (when disabled):
- `disabledReason` — `deceased` / `divorced` (spouse only; children just get disabled with no reason field needed unless you want one for records)

---

## 10. Still open — needs your input before build

1. ~~Does admin enter profile data (§4) in the *same* screen/action as account approval, or separately?~~ **Resolved:** no strong preference — whichever is simpler to build once `UserApprovalScreen.js` is actually seen. Decide pragmatically at build time.
2. ~~Does admin pick spouse-disable reason at the same moment as disabling, or as a separate step?~~ **Resolved:** same moment — a single action that captures both the disable and the reason (Deceased/Divorced) together.
3. Confirm the `familyDataStatus` values in §9 are the right shape, or simplify further if you see redundancy.

---

## 11. Files still needed before coding starts

- `UserApprovalScreen.js` (or wherever admin approves new employees)
- `EmployeeHome.js` (or wherever the Family tile currently lives)
- `FamilyMemberListScreen.js` (if it exists separately from the tile)
- `authRoutes.js` (to see where signup data is currently posted, e.g. `/complete-profile`)

---

*This doc reflects the Day 14 discussion only. Once confirmed, it should be folded into `COMMAND_BOARD.md`'s Phase 4 section to replace the original, simpler plan.*
