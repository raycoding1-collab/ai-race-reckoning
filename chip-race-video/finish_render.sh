#!/bin/bash
# Finish the video unattended: render missing chunks (resumable), concat, mux the v2 song, encode the commit
# copy (< 100 MB) and the 720p preview (< 30 MB), then commit and push. Re-run it if it is stopped.
set -e
cd "$(dirname "$0")"
bash render_chunks.sh
n=$(ls build/chunks/c??.mp4 2>/dev/null | wc -l); [ "$n" -eq 24 ] || { echo "only $n/24 chunks"; exit 1; }
(cd build/chunks && ls c??.mp4 | sed "s/.*/file '&'/" > list.txt)
FF="/usr/bin/ffmpeg -y -loglevel error"
$FF -f concat -safe 0 -i build/chunks/list.txt -c copy build/master_v3.mp4
$FF -i build/master_v3.mp4 -c:v libx264 -preset medium -b:v 5000k -pix_fmt yuv420p -pass 1 -passlogfile build/cc -an -f mp4 /dev/null
$FF -i build/master_v3.mp4 -i audio/silicon_shield.mp3 -map 0:v -map 1:a -c:v libx264 -preset medium -b:v 5000k -pix_fmt yuv420p \
    -pass 2 -passlogfile build/cc -c:a aac -b:a 192k -shortest -movflags +faststart build/silicon_shield_v3.mp4
[ $(stat -c%s build/silicon_shield_v3.mp4) -lt 100000000 ] || { echo "commit copy too big"; exit 1; }
$FF -i build/silicon_shield_v3.mp4 -vf scale=-2:720 -c:v libx264 -preset medium -b:v 1450k -pass 1 -passlogfile build/pv -an -f mp4 /dev/null
$FF -i build/silicon_shield_v3.mp4 -vf scale=-2:720 -c:v libx264 -preset medium -b:v 1450k -pass 2 -passlogfile build/pv \
    -c:a aac -b:a 128k -movflags +faststart build/silicon_shield_v3_preview.mp4
cp build/silicon_shield_v3.mp4 silicon_shield.mp4
git add silicon_shield.mp4
git commit -qm "Silicon Shield v3: SE-look redesign (W7 shield, W11 chamber, global SEM grade), v2 song" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013UyGxSPvaWbUom419vDHJw"
for i in 1 2 3 4; do git push -q origin ccr-c467948d-jdmj79 && break; sleep $((2**i)); done
ls -la silicon_shield.mp4 build/silicon_shield_v3_preview.mp4; echo FINISHED $(date -u +%H:%M)
