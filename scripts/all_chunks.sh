#!/bin/bash
# Render every missing chunk sequentially, then assemble final.mp4.
set -e
cd "$(dirname "$0")/.."
while true; do
  out=$(bash scripts/next_chunk.sh)
  echo "$out"
  [ "$out" = "ALL_CHUNKS_DONE" ] && break
done
: > out/concat.txt
for f in out/chunks/chunk_*.mp4; do
  echo "file '$PWD/$f'" >> out/concat.txt
done
ffmpeg -y -v error -f concat -safe 0 -i out/concat.txt -i out/audio.wav \
  -c:v copy -c:a aac -b:a 192k -movflags +faststart out/final.mp4
echo "FINAL_DONE"
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 out/final.mp4
