#!/bin/zsh
# rebuild.sh [codes...]  - headless rebuild of buildings (default all) then assemble city + base
B=/Applications/Blender.app/Contents/MacOS/Blender
cd "${0:A:h}/.."
LOG=$(mktemp -d)
codes=("$@"); [ ${#codes[@]} -eq 0 ] && codes=(B01 B02 B03 B04 B05 B06 B07 B08)
for c in $codes; do CODE=$c $B -b --factory-startup -P scripts/run_building.py > $LOG/build_$c.log 2>&1 & done
wait
grep -h "TRIS\|tris\|Error\|Traceback" $LOG/build_B0*.log
$B -b --factory-startup -P scripts/build_city.py 2>&1 | grep "city base\|CITY SAVED\|Error\|Traceback"
