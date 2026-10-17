#!/bin/bash
# usage: reach.sh URL  -> HEAD code | ranged-GET code | total bytes | URL
u="$1"
h=$(curl -sIL -m 25 -o /dev/null -w '%{http_code}' "$u" 2>/dev/null)
hdr=$(curl -sL -m 25 -r 0-0 -D - -o /dev/null "$u" 2>/dev/null | tr -d '\r')
rc=$(echo "$hdr" | grep -i '^HTTP/' | tail -1 | awk '{print $2}')
tot=$(echo "$hdr" | awk 'tolower($1)=="content-range:"{print $3}' | tail -1 | sed 's#.*/##')
echo "HEAD=$h GET-range=${rc:-000} total=${tot:-?} | $u"
