#!/bin/bash
# Resumable render: 6-second chunks into build/chunks/cNN.mp4 (no audio). Finished chunks are skipped, so a
# container restart loses at most one chunk. Usage: render_chunks.sh [first_chunk] [last_chunk]
cd "$(dirname "$0")/app"
export CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
OUT=../build/chunks; END=142.25; N=24
for i in $(seq ${1:-0} ${2:-$((N-1))}); do
  f=$(printf "%s/c%02d.mp4" $OUT $i)
  ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" >/dev/null 2>&1 && continue
  from=$((i*6)); to=$(( (i+1)*6 )); [ $i -eq $((N-1)) ] && to=$END
  bun scripts/render.ts video --from $from --to $to --fps 30 --samples 1 --workers 2 --preset medium --noaudio --out "$f.tmp.mp4" > $OUT/c$i.log 2>&1 && mv "$f.tmp.mp4" "$f"
  echo "chunk $i done $(date -u +%H:%M)"
done
