#!/bin/zsh
# Фоновый Blender для «Подземелья»: не больше двух одновременно на эту задачу.
# Использование: tools/survivors/blender/bg.sh <script.py> [аргументы после --]
# Занимает слот ~/Desktop/.survivors-blender-slot-1 или -2 (mkdir атомарен), ждёт свободный,
# слот старше 20 минут считает брошенным. Запускает Blender -b --factory-startup со скриптом.
B=/Applications/Blender.app/Contents/MacOS/Blender
S=$1; shift
slot=""
while [ -z "$slot" ]; do
  for i in 1 2; do
    d=$HOME/Desktop/.survivors-blender-slot-$i
    if mkdir $d 2>/dev/null; then slot=$d; echo "$S $(date '+%H:%M:%S') pid $$" > $d/owner.txt; break; fi
    age=$(( $(date +%s) - $(stat -f %m $d 2>/dev/null || date +%s) ))
    if [ $age -gt 1200 ]; then rm -rf $d; fi
  done
  [ -z "$slot" ] && sleep 5
done
trap 'rm -rf $slot' EXIT INT TERM
$B -b --factory-startup --python-exit-code 1 --python "$S" -- "$@"
