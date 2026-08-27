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
**Type:** Functional | **Status:** ✅ RESOLVED (fixed and confirmed Aug 27, 2026 — both web and mobile)

**Root cause, confirmed via Cloud Run server logs:** Google Cloud billing had been **disabled** for the `ffl-medical-centre-app` project since **August 16, 2026 (01:13:33 PKT)** — confirmed by reviewing the full `auth` function log history, which shows unbroken 500 errors with the billing-disabled message from that timestamp through 23:41 on August 27 (11 days). Every single Cloud Run backend function (`auth`, `circulars`, `availability`, `feedback`, `directory`, etc.) rejected every request it received with an internal error: `"The request failed because billing is disabled for this project."` Because the failure happened before the function's own code ever ran, no CORS headers were ever returned on the failed response — so browsers reported it as a generic CORS error, and the mobile app reported it as a generic network/login error. **This was never a timing, cold-start, or race-condition issue** — every backend call failed unconditionally, every time, regardless of speed or retries.

**Fix:** re-linked a valid billing account to the project via Google Cloud Console, then redeployed the `auth` Cloud Function (`firebase deploy --only functions:auth`) to clear a stale instance that had cached the old billing-disabled state. Confirmed via direct `curl` tests against the Cloud Run endpoint, then via live login testing on both **web** (`ffl-medical-centre-app.web.app`, two separate accounts, DevTools Network tab showing clean 200 responses on `/me`, `update-last-login`, `pending-users`) and **mobile** (installed APK `22baf9a5`, no rebuild needed since the fix was entirely server-side) — no error dialogs on either platform.

**Investigation trail (kept for reference — several incorrect theories were ruled out with evidence before finding the real cause):**
1. Initial theory: race condition / cold start (first API call after inactivity times out, self-resolves on retry). Added a silent-retry helper (`app/src/utils/apiRetry.js`) and applied it to `LoginScreen.js`'s `/me` call as a first attempt at a fix. **This did not resolve the issue** — retrying against a billing-disabled endpoint just fails identically twice, which is what testing showed.
2. Browser DevTools Network/Console tabs revealed the real browser-level error: `CORS error` / `"No 'Access-Control-Allow-Origin' header is present"` on every backend call (`me`, `update-last-login`, `pending-users`, `my`).
3. Ruled out: missing CORS middleware — `functions/index.js` already had correct `cors({ origin: true })` config.
4. Ruled out: Cloud Run requiring authentication at the platform level — Security tab confirmed `allUsers` already had public invoker access.
5. Ruled out: wrong/dead URL — a direct `curl OPTIONS` request to the exact URL in `app/src/config/api.js` (`auth-nniqmcbj4a-el.a.run.app`) returned 404 at one point, but the Cloud Run console's own listed URL (`asia-south1-ffl-medical-centre-app.cloudfunctions.net/auth`) returned a 500, not 404 — ruling out a simple wrong-URL explanation.
6. **Found via Cloud Run Logs tab:** the actual `textPayload` on every failing request read `"The request failed because billing is disabled for this project."`, consistently since Aug 18.
7. After linking billing, brief 429 "Rate exceeded" / "no available instance" errors appeared for ~20 minutes — ruled out as a hard quota ceiling (Quotas page showed all Cloud Run metrics under 25% usage, nothing near a limit) and attributed to normal propagation delay after a billing change. Resolved on its own once enough time had passed and the `auth` function was redeployed fresh.

**Retry helper left in place, not removed:** `app/src/utils/apiRetry.js` and the retry logic added to `LoginScreen.js`'s `/me` call are harmless and provide minor resilience against genuine transient network blips, even though they were not the fix for this particular bug. No need to revert.

**Not yet rolled out to other screens:** the retry pattern was only applied to `LoginScreen.js` before the real root cause was found. Given the actual bug was billing (now fixed), there is **no remaining need** to roll the retry pattern out to Circulars, Doctors Directory, Patient Feedback, or Doctor Availability — their errors were caused by the same billing outage and are resolved now that billing is fixed. Confirmed via live re-test on both web and mobile, admin role, two accounts — no errors on any previously-affected screen.

**Operational lesson for future sessions:** when every backend call fails identically regardless of screen, role, or platform, check Google Cloud **Billing** status early — a disabled billing account produces errors that look exactly like CORS misconfiguration, missing permissions, or network timeouts, and can waste significant investigation time if billing isn't checked first.

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
| 3 | Spurious error dialogs | Functional | ✅ Resolved | Root cause: Cloud Run billing disabled since ~Aug 18. Fixed by re-linking billing + redeploying `auth` function. Confirmed clean on web (2 accounts) and mobile. |
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
4. ~~Re-verify all findings against the current build~~ — **done for items 1, 2, 3**
5. ~~Investigate and fix root cause of item 3~~ — **done, Aug 27.** Root cause was Cloud Run billing disabled since ~Aug 18, not a code bug. Fixed by re-linking billing account and redeploying the `auth` function. Confirmed clean on web and mobile.
6. Re-verify items 4, 5, and 8 on the current build before writing any code for them — **next up**
7. Fix items 4 and 5 (if still confirmed) — cosmetic but high-priority
8. Review all frontend modifications made during the fix pass (including the retry helper added in step 5's investigation — harmless, can stay)
9. Lock the design document — resolve items 6 and 7 (open design decisions) at this stage
10. Move to Play Store submission

---

*Originally generated Day 10 (audit close-out session). Updated Aug 27, 2026 after discovering the original audit was conducted against a stale APK build — findings 1–3 re-verified against a freshly rebuilt and reinstalled APK (build `22baf9a5`, commit `cee399f4`). Findings 4, 5, and 8 remain as originally recorded on Day 10 and should be treated as provisional until re-verified the same way.*