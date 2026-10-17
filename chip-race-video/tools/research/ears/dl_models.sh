#!/bin/bash
# usage: dl_models.sh <tag> <asset-without-.tar.bz2> ...   (each into its own new dir under models/)
E=/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/ears
tag="$1"; shift
for n in "$@"; do
  d="$E/models/$n"; mkdir -p "$d"
  s=$(date +%s.%N)
  curl -sSL -m 900 -o "$E/models/$n.tar.bz2" -w "$n http=%{http_code} bytes=%{size_download} speed=%{speed_download}B/s\n" "https://github.com/k2-fsa/sherpa-onnx/releases/download/$tag/$n.tar.bz2"
  tar -xjf "$E/models/$n.tar.bz2" -C "$d" 2>&1 | tail -2
  e=$(date +%s.%N)
  printf '%s done in %.1fs\n' "$n" "$(echo "$e - $s" | bc)"
done
