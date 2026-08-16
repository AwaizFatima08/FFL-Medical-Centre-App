# FFL Medical Centre — Command Board

Quick reference for daily work. For locked flow status, architecture, and decisions, see FFL_Medical_Centre_Master_Design.md instead — this file does not duplicate that content.

---

## Quick Paths
- NAS project: /mnt/storage/projects/ffl-medical-centre/
- Frontend: app/src/  |  Backend: functions/src/
- GitHub: AwaizFatima08/FFL-Medical-Centre-App (private)
- Firebase project: ffl-medical-centre-app
- Web app: https://ffl-medical-centre-app.web.app
- Dev server: 192.168.1.30:8081 (Expo)  |  VS Code: 192.168.1.30:8080

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

**Backup (end of session):**
bash /mnt/storage/projects/ffl-medical-centre/scripts/backup.sh "Day N: description"

## Session Log
(Newest first)

- Day 10: Repo cleanup — protected serviceAccountKey.json, removed 3 stray backup folders, untracked app/dist, created docs/ and scripts/, moved importVaccineSchedule.js + backup.sh into scripts/, removed dead fix.py test file, committed design doc.

## Open Items
- Report frontend screens: done (corrected — was previously logged as pending)
- Notification debugging: pending field test
- Vaccination flow (Flow 2) status: conflicting info between design doc (V2) and prior session notes (V1 built) — to be confirmed during audit
- Production build + Play Store submission: pending post-audit
