# FFL Medical Centre — Command Board

Quick reference for daily work. For locked flow status, architecture, and decisions, see FFL_Medical_Centre_Master_Design.md instead — this file does not duplicate that content. For the full pre-production audit findings, see docs/DAY10_AUDIT_FINDINGS.md.

---

## Quick Paths
- NAS project: /mnt/storage/projects/ffl-medical-centre/
- Frontend: app/src/  |  Backend: functions/src/
- GitHub: AwaizFatima08/FFL-Medical-Centre-App (private)
- Firebase project: ffl-medical-centre-app
- Web app: https://ffl-medical-centre-app.web.app
- Dev server: 192.168.100.122:8081 (Expo) | VS Code: 192.168.100.122:8080
  *(NAS IP changed from 192.168.1.30 — updated Aug 27, 2026. If dev server isn't responding, confirm `npx expo start` is actually running on the NAS before assuming a network issue.)*

## Daily Commands

**Start dev server:**
cd /mnt/storage/projects/ffl-medical-centre/app
npx expo start

**Deploy web:**
cd /mnt/storage/projects/ffl-medical-centre/app
rm -rf dist
npx expo export --platform web
cd /mnt/storage/projects/ffl-medical-centre
firebase deploy --only hosting

**Deploy functions (targeted):**
cd /mnt/storage/projects/ffl-medical-centre/functions
firebase deploy --only functions:FUNCTION_NAME

**Build Android APK (EAS):**
cd /mnt/storage/projects/ffl-medical-centre/app
npx eas build --platform android --profile preview
*(Standalone installable APK, ~10-20 min build time on Expo's servers. Always confirm `git status` is clean and `git pull` is up to date before building, so the build reflects the true latest code.)*

**Check which commit a build was made from:**
npx eas build:list --platform android --limit 5
*(Cross-reference the "Commit" field against `git log` before trusting a finding tested on an installed APK — see Day 10 lesson below.)*

**Backup (end of session):**
bash /mnt/storage/projects/ffl-medical-centre/scripts/backup.sh "Day N: description"
*(Note: workflow has shifted to manual VS Code editing on the NAS — Homi now handles backups manually rather than relying on this script as the primary flow. Script still works if used.)*

## Session Log
(Newest first)

- **Aug 27, 2026 (item 3 root cause found & fixed):** Investigated finding #3 (spurious error dialogs). Initial theory (Cloud Run cold-start race condition) led to a retry helper (`app/src/utils/apiRetry.js`) applied to `LoginScreen.js` — this did NOT fix the issue. Browser DevTools revealed the real symptom was a CORS error on every backend call. Ruled out missing CORS config, missing Cloud Run public-invoker permission, and wrong/dead URLs one at a time with direct evidence (curl tests, Cloud Run console checks) before finding the actual cause in the Cloud Run **Logs** tab: **Google Cloud billing had been disabled for the project since ~Aug 18**, causing every single backend function call to fail unconditionally, on every screen, both platforms — not a timing issue at all. Fixed by re-linking a valid billing account and redeploying the `auth` function to clear a stale instance. A brief ~20min window of 429 errors followed (propagation delay, not a quota ceiling — Quotas page confirmed all Cloud Run metrics under 25% usage) and resolved on its own. **Confirmed fully resolved** via live login testing on web (2 accounts, clean Network tab) and mobile (installed APK, no rebuild needed — fix was server-side only). Retry helper left in place (harmless) but was not the actual fix. `docs/DAY10_AUDIT_FINDINGS.md` updated with full investigation trail and an operational lesson: check Billing status early when every backend call fails identically, before assuming a code bug.
- **Aug 27, 2026 (code-fix phase start):** Before starting Day 10's planned code fixes, discovered the audit had been conducted against a stale installed APK (predating commit `259fe099`, May 13). Rebuilt and reinstalled current APK (`22baf9a5`, commit `cee399f4`) and re-verified all functional findings against it. **Result: findings #1 (vaccination mismatch) and #2 (tile parity gap) were already resolved in code — no fixes needed.** Finding #3 (spurious error dialogs) re-confirmed as still genuinely present at that point (root cause found later same day — see entry above). Findings #4, #5, #8 not yet re-verified on current build — treat as provisional. NAS IP corrected (was 192.168.1.30, now 192.168.100.122).
- Day 10 (audit close-out): Full pre-production audit complete — all 6 roles in scope reviewed (employee, reception, doctor, driver, admin_incharge, cmo). Nurse, lab_technologist, pharmacy_incharge deferred to V2. 8 consolidated findings documented in docs/DAY10_AUDIT_FINDINGS.md. Two design decisions logged as open (home screen header/logout layout, employee tile color) — to be resolved at design-lock stage, not during bug fixes.
- Day 10: Repo cleanup — protected serviceAccountKey.json, removed 3 stray backup folders, untracked app/dist, created docs/ and scripts/, moved importVaccineSchedule.js + backup.sh into scripts/, removed dead fix.py test file, committed design doc.

## Open Items

**Bug fixes (from Day 10 audit, re-verified Aug 27 — see DAY10_AUDIT_FINDINGS.md for full detail):**
- [x] ~~Vaccination flow mobile/web mismatch~~ — **RESOLVED**, already fixed in code (commit `259fe099`), confirmed on fresh build Aug 27
- [x] ~~Blood Donor Directory + Reports tiles missing from mobile home screens~~ — **RESOLVED**, confirmed present on all 6 roles on fresh build Aug 27
- [x] ~~Spurious "Network error" / "Login Failed" dialogs~~ — **RESOLVED, Aug 27.** Root cause was Cloud Run billing disabled since ~Aug 18 (not a code bug). Fixed by re-linking billing + redeploying `auth` function. Confirmed clean on web (2 accounts) and mobile.
- [ ] Login screen requires scrolling — **not yet re-verified on current build.** Confirm before writing any fix (same discipline that closed items 1 & 2 without code changes).
- [ ] Mobile home screen tile/icon/logout alignment — **not yet re-verified on current build.** Note: doctor (6 tiles) fit without scrolling on current build — may be specific to 7+-tile roles (reception, admin, cmo), not universal.

**Design decisions (resolve at design-lock, not during fixes):**
- [ ] Home screen header/logout layout — standardize on driver's header-bar style, or keep floating bell/logout used by the other 5 roles?
- [ ] Employee's pink tiles vs. white tiles everywhere else — keep the distinction or unify? (confirmed still present on current build, Aug 27)

**Process (per audit methodology, in order):**
1. ~~Audit all roles~~ — done
2. ~~Consolidate findings report~~ — done (DAY10_AUDIT_FINDINGS.md)
3. ~~Rebuild + reinstall current APK before starting fixes~~ — done Aug 27
4. ~~Re-verify findings against current build~~ — done for items 1, 2, 3
5. ~~Investigate and fix root cause of item 3~~ — done Aug 27 (billing outage, not a code bug — see session log)
6. Re-verify items 4, 5, 8 on current build — **next up**
7. Fix items 4 and 5 (if still confirmed) — cosmetic but high priority
8. Review all frontend modifications made during the fix pass
9. Lock design document (resolve open design decisions above)
10. Production build + Play Store submission

**Other pending:**
- Notification debugging — deferred to final pre-production testing round
- Family module — not yet built (V1 scope); feedback form patient-name field stays text-based until then
- Report frontend screens — backend done (7 endpoints, pdfkit/json2csv), frontend screens pending