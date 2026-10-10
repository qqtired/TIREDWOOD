#!/bin/zsh
# Фоновый Blender для косметики: занимает слот фермы (s1|s2), запускает скрипт, освобождает слот.
# cos_run.sh <script.py> [имена вещей...]
S=~/Desktop/.farm-blender-slots
mkdir $S 2>/dev/null
while true; do
  if mkdir $S/s1 2>/dev/null; then N=s1; break; fi
  if mkdir $S/s2 2>/dev/null; then N=s2; break; fi
  sleep 20
done
echo "farm-cosmetics $(date '+%H:%M:%S')" > $S/$N/owner.txt
echo "SLOT $N"
SCRIPT=$1; shift
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python "$SCRIPT" -- "$@" 2>&1 | grep -E "ITEM|DONE|PROXY|PREVIEW|Error|error|Traceback|line [0-9]+|Exception|Warning: .*cos" | grep -v "^Read prefs" | head -80
mv $S/$N ~/.Trash/farm-slot-$(date +%s)
echo "SLOT $N released"
