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

- **Aug 27, 2026 (code-fix phase start):** Before starting Day 10's planned code fixes, discovered the audit had been conducted against a stale installed APK (predating commit `259fe099`, May 13). Rebuilt and reinstalled current APK (`22baf9a5`, commit `cee399f4`) and re-verified all functional findings against it. **Result: findings #1 (vaccination mismatch) and #2 (tile parity gap) were already resolved in code — no fixes needed.** Finding #3 (spurious error dialogs) re-confirmed as still genuinely present, with new detail: login shows a post-success "Login Failed" dialog (fires after the user is already logged in and home screen has loaded; OK dismisses with no side effects). Two message variants and two dialog-title variants noted as a possible lead for root-cause investigation. Findings #4, #5, #8 not yet re-verified on current build — treat as provisional. `docs/DAY10_AUDIT_FINDINGS.md` updated accordingly. NAS IP corrected (was 192.168.1.30, now 192.168.100.122).
- Day 10 (audit close-out): Full pre-production audit complete — all 6 roles in scope reviewed (employee, reception, doctor, driver, admin_incharge, cmo). Nurse, lab_technologist, pharmacy_incharge deferred to V2. 8 consolidated findings documented in docs/DAY10_AUDIT_FINDINGS.md. Two design decisions logged as open (home screen header/logout layout, employee tile color) — to be resolved at design-lock stage, not during bug fixes.
- Day 10: Repo cleanup — protected serviceAccountKey.json, removed 3 stray backup folders, untracked app/dist, created docs/ and scripts/, moved importVaccineSchedule.js + backup.sh into scripts/, removed dead fix.py test file, committed design doc.

## Open Items

**Bug fixes (from Day 10 audit, re-verified Aug 27 — see DAY10_AUDIT_FINDINGS.md for full detail):**
- [x] ~~Vaccination flow mobile/web mismatch~~ — **RESOLVED**, already fixed in code (commit `259fe099`), confirmed on fresh build Aug 27
- [x] ~~Blood Donor Directory + Reports tiles missing from mobile home screens~~ — **RESOLVED**, confirmed present on all 6 roles on fresh build Aug 27
- [ ] Spurious "Network error" / "Login Failed" dialogs — **still open, confirmed on current build.** Root cause not yet found; likely race condition (auth/data-load state checked before it settles). Login-specific: fires *after* successful login, on top of already-loaded home screen. Two message variants + two dialog-title variants observed — may be 2 related code paths, investigate both.
- [ ] Login screen requires scrolling — **not yet re-verified on current build.** Confirm before writing any fix (same discipline that closed items 1 & 2 without code changes).
- [ ] Mobile home screen tile/icon/logout alignment — **not yet re-verified on current build.** Note: doctor (6 tiles) fit without scrolling on current build — may be specific to 7+-tile roles (reception, admin, cmo), not universal.

**Design decisions (resolve at design-lock, not during fixes):**
- [ ] Home screen header/logout layout — standardize on driver's header-bar style, or keep floating bell/logout used by the other 5 roles?
- [ ] Employee's pink tiles vs. white tiles everywhere else — keep the distinction or unify? (confirmed still present on current build, Aug 27)

**Process (per audit methodology, in order):**
1. ~~Audit all roles~~ — done
2. ~~Consolidate findings report~~ — done (DAY10_AUDIT_FINDINGS.md)
3. ~~Rebuild + reinstall current APK before starting fixes~~ — done Aug 27
4. ~~Re-verify findings against current build~~ — done for items 1, 2, 3; **pending for items 4, 5, 8**
5. Re-verify items 4, 5, 8 on current build
6. Investigate root cause of item 3 (spurious error dialogs) — highest-priority remaining functional bug
7. Fix items 4 and 5 (if still confirmed) — cosmetic but high priority
8. Review all frontend modifications made during the fix pass
9. Lock design document (resolve open design decisions above)
10. Production build + Play Store submission

**Other pending:**
- Notification debugging — deferred to final pre-production testing round
- Family module — not yet built (V1 scope); feedback form patient-name field stays text-based until then
- Report frontend screens — backend done (7 endpoints, pdfkit/json2csv), frontend screens pending