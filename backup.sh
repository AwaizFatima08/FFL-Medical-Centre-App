#!/bin/bash
# FFL Medical Centre — Full backup script
# Run from project root: bash backup.sh "commit message"

MSG=${1:-"Session backup"}
PROJECT="/mnt/storage/projects/ffl-medical-centre"
BACKUPS="/mnt/storage/project_backups/ffl-medical-centre"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== Layer 3: Git ==="
cd "$PROJECT/app"
git add -A
git commit -m "$MSG"
git push

echo "=== Layer 1: Local snapshot ==="
mkdir -p "$BACKUPS"
cp -r "$PROJECT" "$BACKUPS/$TIMESTAMP"
echo "Saved to $BACKUPS/$TIMESTAMP"

echo "=== Layer 2: Google Drive ==="
rclone sync "$PROJECT" gdrive:1dIpHwIeba2sVsd3jDsBL7ddOHCBXg4r9 \
  --exclude "node_modules/**" \
  --exclude ".expo/**" \
  --exclude ".git/**" \
  --exclude ".kilocode/**" \
  --exclude ".claude/**" \
  --exclude ".windsurf/**" \
  --exclude ".roo/**" \
  --exclude ".junie/**" \
  --exclude ".cortex/**" \
  --exclude ".goose/**" \
  --exclude ".kiro/**" \
  --exclude "skills/**" \
  --progress

echo "=== Backup complete ==="
