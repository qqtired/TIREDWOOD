#!/bin/bash
W=/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/icons-work
args=()
for d in $W/*/; do n=$(basename $d); [ "$n" = out ] || [ "$n" = preview ] && continue; [[ "$n" == *-v[0-9] ]] && continue; if [ -f $d/orig.png ] && [ ! -f $W/out/$n.webp ]; then args+=("$n=$d/orig.png"); fi; done
[ ${#args[@]} -gt 0 ] && node $W/post.mjs process $W/out "${args[@]}"
