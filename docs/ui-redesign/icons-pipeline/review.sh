#!/bin/bash
# usage: review.sh <name> <dirname...>   (dir names; uses <dir>/orig.png)
W=/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/icons-work
name=$1; shift
args=()
for d in "$@"; do args+=("$d=$W/$d/orig.png"); done
node $W/post.mjs preview $W/preview/$name.png "${args[@]}"
