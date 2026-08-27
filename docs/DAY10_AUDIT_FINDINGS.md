# FFL Medical Centre — Day 10 Pre-Production Audit: Consolidated Findings

**Status:** Audit complete. Code-fix phase in progress — findings re-verified against a fresh build Aug 27, 2026 before fixing (see note below).
**Scope:** 6 of 9 roles (employee, reception, doctor, driver, admin_incharge, cmo). Nurse, lab_technologist, and pharmacy_incharge deferred — tied to V2 flows (vaccination, pharmacy, lab) not yet built.
**Method:** Each role reviewed via mobile + web screenshots, one role closed at a time, before moving to the next.

**Important note (added Aug 27, 2026):** The original Day 10 audit was conducted against an Android APK installed *before* several fixes had already landed in source (last confirmed-working build predated commit `259fe099`, May 13). Before starting code fixes, the team rebuilt and reinstalled the current APK (build `22baf9a5`, commit `cee399f4`) and re-checked every finding against it. Findings 1 and 2 turned out to already be resolved in code — no fix needed, just a stale test build. Finding 3 was re-confirmed as still genuinely present. **Lesson for future audits/fixes: always confirm which build (commit) is installed on the test device before trusting a finding, especially before writing new code to "fix" something that may already be fixed.**

---

## How to read this report

Findings are split into two kinds:

- **Functional** — something doesn't work as designed, or works differently than intended.
- **Cosmetic** — an appearance/layout defect (scroll, spacing, alignment, sizing). *Cosmetic does not mean low priority* — some cosmetic issues (e.g. the login screen) affect every user's first impression and are ranked accordingly.

Each finding lists which roles/platforms it was confirmed on, so fixes can be scheduled and verified individually per the audit's stated methodology (fix one issue at a time, verify fully, even for shared-root-cause bugs).

---

## Findings

### 1. Vaccination flow: mobile/web mismatch
**Type:** Functional | **Status:** ✅ RESOLVED (confirmed Aug 27, 2026)

Was live and functional on the employee mobile home screen, while web correctly showed "Available Soon" — per the deliberate decision to defer the full vaccination flow to V2.

Fixed in commit `259fe099` (May 13, 2026) — the `active` flag on the vaccination tile was set to `false`, matching web's disabled state. Confirmed via fresh EAS build (`22baf9a5`, commit `cee399f4`, installed Aug 27, 2026): the tile now correctly shows disabled/"Available Soon" on mobile, matching web.

**Root cause of the false finding:** the phone used during the original Day 10 audit was running an older APK build that predated this commit. `git blame` confirmed the fix commit (`259fe099`) is an ancestor of the installed build's commit (`cee399f4`), so the fix was already shipped — it just hadn't been reinstalled on the test device. **No code change was made or needed.**

---

### 2. Mobile/web home screen tile parity gap
**Type:** Functional | **Status:** ✅ RESOLVED (confirmed Aug 27, 2026)

Blood Donor Directory and Reports tiles were reported missing from mobile home screens — Blood Donors for employee/doctor, and both Blood Donors + Reports for reception, admin_incharge, and CMO.

Confirmed present and functional on **all 6 roles** on the fresh build (`22baf9a5`) installed Aug 27, 2026 — same stale-APK situation as Finding #1. Screenshots taken today show Blood Donor Directory and Reports tiles correctly rendering on doctor, reception, cmo, and admin_incharge mobile home screens, matching web. **No code change was made or needed.**

---

### 3. Spurious "Network error" / "Login Failed" dialogs
**Type:** Functional (cosmetic-adjacent — doesn't break data, but is a false-alarm error UX) | **Status:** 🔴 STILL OPEN (re-confirmed Aug 27, 2026 on the current, non-stale build)

Unlike findings 1 and 2, this issue reproduced cleanly on the freshly rebuilt and reinstalled APK — this is a real, currently-present bug, not a stale-build artifact.

**Screens reproduced today (admin role, mobile):** Login (see detail below), Circulars & Notices, Doctors Directory, Patient Feedback, Doctor/Manage Availability.

**Login-specific behavior (new detail, confirmed Aug 27):** The error does not appear on the login form itself. Sequence observed: user enters email + password → taps Sign In → screen navigates to the home screen in the background → a "Login Failed — Login failed. Please try again." dialog appears on top of the already-loaded home screen → user is, in fact, already successfully logged in. Pressing OK dismisses the dialog with **no side effects** — no retry occurs, nothing is re-triggered, session remains valid. This is consistent across all affected screens: the underlying action already succeeded before the dialog appears; OK just clears the dialog.

**This strongly supports the race-condition theory:** some check is firing against auth/session or data-load state that hasn't caught up to an action that already completed successfully (e.g. a Firebase call executing before auth/session initialization settles).

**Two message variants observed — may indicate two related but distinct code paths, not one identical bug:**
- `"Network error. Please check your connection."` — seen on Circulars, Doctors Directory, Patient Feedback, Doctor Availability
- `"Login failed. Please try again."` — seen only post-login, on the home screen

**Dialog title inconsistency (possible implementation clue):**
- Title **"Error"** — Circulars & Notices
- Title **"Alert"** — Doctors Directory, Patient Feedback, Doctor Availability, and the post-login "Login Failed" dialog

This split may point to two different implementations of the same underlying pattern (e.g. one screen still calling native `Alert.alert()` directly vs. others using the custom `webAlert`/`webConfirm` helper noted in project conventions). Worth checking during root-cause investigation rather than assuming a single shared code path.

**Clean on this pass, NOT confirmed resolved:** Reports, Blood Donor Directory, Family Records, Fitness Appointments, and User Approvals showed no error dialog during today's re-check (admin role). Given the confirmed race-condition nature of this bug, a clean pass does not rule out intermittent recurrence. **Do not mark these screens as fixed or unaffected without repeated clean checks across multiple sessions/roles.**

**Previously noted distinct error (Day 10 audit) — status unclear:** the original audit found a *different* message on User Approvals ("Could not load pending users"). Today's pass showed User Approvals clean (no error at all). This could mean it's been fixed, or simply didn't trigger this time. Re-check before assuming either.

---

### 4. Login screen requires scrolling
**Type:** Cosmetic | **Status:** Not yet re-verified on current build — treat prior finding as provisional

Originally confirmed on all 6 audited roles, both mobile and web (Day 10 audit, possibly stale build — see note at top of document). Layout needs adjusting so Sign In is visible without scrolling on first load.

**High priority despite being cosmetic** — this is the very first screen every user of the app sees.

**Action before fixing:** re-confirm on the current (non-stale) build before writing any layout code, following the same discipline that resolved findings 1 and 2 without needing code changes.

---

### 5. Mobile home screen tile/icon/logout alignment
**Type:** Cosmetic | **Status:** Not yet re-verified on current build — treat prior finding as provisional

Originally confirmed on employee, reception, doctor, admin_incharge, CMO (all multi-tile roles) — tiles requiring scroll to see all of them, inconsistent tile/icon alignment, logout button placement affected by the same spacing issue.

**User-confirmed constraint (still valid):** tiles may be resized, rearranged, or made smaller as needed — the only requirement is that text and icons stay legible and all tiles fit without scrolling.

**Exempt:** Driver role — single-purpose UI with no tile grid (see item 8).

**Action before fixing:** re-confirm on the current build. Note from today's screenshots: doctor's mobile home screen (6 tiles) fits on one screen without scrolling on the current build — useful signal that this issue is specific to roles with 7+ tiles (reception, admin, cmo), not universal across all multi-tile roles. Worth designing the fix around that distinction rather than assuming every multi-tile role needs the same treatment.

---

### 6. Home screen header/logout layout — inconsistent across roles (open design decision)
**Type:** Cosmetic / design consistency — **decision needed, not yet made**

Two different layout patterns exist for the home screen header:
- **Driver:** a colored header bar containing the title, bell, and logout together.
- **Employee, reception, doctor, admin_incharge, CMO:** a floating bell and logout button with the title centered below, no header bar.

Driver is the only role using the bar style — 5 of 6 audited roles use the floating style. There was no natural split by role type (e.g. single-action vs. multi-tile) since driver is the only single-action role in the audit; the "outlier" and the "different type of role" happen to be the same role, so this doesn't resolve on its own.

**Recommendation:** Treat as a genuine design decision to make when the design document is locked, not a bug to silently fix during the code-fix pass. The header-bar style has some usability advantages (clearer contained header, standard mobile convention) but standardizing on it means modifying 5 screens to match 1, which is real dev + testing time — worth deciding deliberately rather than defaulting to either option.

**Not affected by the stale-build issue** — this is a design decision, not a bug, and remains open regardless of build freshness.

---

### 7. Employee home screen uses colored (pink) tiles vs. white tiles elsewhere
**Type:** Cosmetic / design consistency — **decision needed, not yet made**

Employee's mobile home screen uses pink-tinted tiles; every other role audited (reception, doctor, admin_incharge, CMO) uses plain white tiles. Confirmed still true on the current build (Aug 27 screenshots). This is a separate inconsistency from item 6 (header/logout layout) and should be decided independently — they don't have to resolve the same direction.

---

### 8. Driver role — exempt from scroll issues, confirmed working end-to-end
**Type:** Informational, not a defect

Driver's home screen (single "No Active Trip" / active-trip status card, no tile grid) is not affected by items 4 or 5's scrolling issues — it fits in one screen on both platforms. Both the idle state and the active-trip/dispatch-acceptance flow were confirmed working (Day 10 audit; not yet re-verified on current build, but low risk given the simple single-card layout). Driver's login screen *is* affected by items 3 and 4 like every other role.

---

## Summary table

| # | Finding | Type | Status (as of Aug 27, 2026) | Notes |
|---|---|---|---|---|
| 1 | Vaccination mobile/web mismatch | Functional | ✅ Resolved | Fix already in code (May 13); Day 10 audit ran on stale build. No code change needed. |
| 2 | Blood Donors / Reports missing on mobile | Functional | ✅ Resolved | Same stale-build situation as #1. No code change needed. |
| 3 | Spurious error dialogs | Functional | 🔴 Open — re-confirmed on current build | Login shows a post-success "Login Failed" dialog; two message variants and two dialog-title variants observed — may be 2 related code paths, not 1. Root cause not yet found. |
| 4 | Login screen scroll | Cosmetic | ⏳ Not yet re-verified | Re-confirm on current build before fixing. |
| 5 | Mobile tile/icon/logout alignment | Cosmetic | ⏳ Not yet re-verified | Re-confirm on current build. Doctor (6 tiles) fits without scroll on current build — may be a 7+-tile-role issue specifically. |
| 6 | Header/logout layout inconsistency | Cosmetic / design decision | Unchanged — open | Not a bug; decide at design-lock. |
| 7 | Employee pink tiles vs. white elsewhere | Cosmetic / design decision | Confirmed still present | Decide independently of item 6. |
| 8 | Driver role working end-to-end | N/A | Assumed still valid | Not yet re-verified on current build; low risk. |

---

## Next steps (updated Aug 27, 2026)

1. ~~Review each role~~ — done
2. ~~Consolidate one findings report~~ — done (this document)
3. ~~Rebuild + reinstall current APK before starting fixes~~ — **done, Aug 27** (this step was added after discovering findings 1 & 2 were stale-build artifacts)
4. ~~Re-verify all findings against the current build~~ — **done for items 1, 2, 3. Still pending for items 4, 5, 8.**
5. Re-verify items 4, 5, and 8 on the current build before writing any code for them
6. Investigate root cause of item 3 (spurious error dialogs) — highest-priority remaining functional bug
7. Fix items 4 and 5 (if still confirmed) — cosmetic but high-priority
8. Review all frontend modifications made during the fix pass
9. Lock the design document — resolve items 6 and 7 (open design decisions) at this stage
10. Move to Play Store submission

---

*Originally generated Day 10 (audit close-out session). Updated Aug 27, 2026 after discovering the original audit was conducted against a stale APK build — findings 1–3 re-verified against a freshly rebuilt and reinstalled APK (build `22baf9a5`, commit `cee399f4`). Findings 4, 5, and 8 remain as originally recorded on Day 10 and should be treated as provisional until re-verified the same way.*