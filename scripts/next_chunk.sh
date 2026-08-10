#!/bin/bash
# Render the next missing video chunk (muted). Prints REMAINING=<n> when done.
set -e
cd "$(dirname "$0")/.."
TOTAL=$(node -e "const t=require('./src/timeline.json');console.log(Math.ceil(t.durationSec*30))")
CHUNK=2000
mkdir -p out/chunks
n_chunks=$(( (TOTAL + CHUNK - 1) / CHUNK ))
for ((i = 0; i < n_chunks; i++)); do
  start=$((i * CHUNK))
  end=$((start + CHUNK - 1))
  [ "$end" -ge "$TOTAL" ] && end=$((TOTAL - 1))
  f=out/chunks/chunk_$(printf %03d "$i").mp4
  if [ ! -s "$f" ] || ! ffprobe -v error "$f" >/dev/null 2>&1; then
    rm -f "$f"
    npx remotion render build Main "$f.tmp.mp4" --codec=h264 --crf=19 --muted --frames="$start-$end" --log=error
    mv "$f.tmp.mp4" "$f"
    remaining=$((n_chunks - i - 1))
    echo "RENDERED chunk_$i ($start-$end) REMAINING=$remaining"
    exit 0
  fi
done
echo "ALL_CHUNKS_DONE"
