#!/bin/bash
# Resumable chunked render: video in ~3050-frame chunks (muted), audio in one
# fast pass, then concat + mux into out/final.mp4. Re-running skips chunks
# that already exist and validate, so a killed run resumes cheaply.
set -e
cd "$(dirname "$0")/.."
TOTAL=$(node -e "const t=require('./src/timeline.json');console.log(Math.ceil(t.durationSec*30))")
CHUNK=3050
mkdir -p out/chunks

# 1) audio (no frame screenshots -> fast)
if [ ! -s out/audio.wav ]; then
  npx remotion render Main out/audio.wav --codec=wav --log=error
  echo "AUDIO_DONE"
fi

# 2) video chunks
i=0
start=0
while [ "$start" -lt "$TOTAL" ]; do
  end=$((start + CHUNK - 1))
  [ "$end" -ge "$TOTAL" ] && end=$((TOTAL - 1))
  f=out/chunks/chunk_$(printf %03d "$i").mp4
  if [ ! -s "$f" ] || ! ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" >/dev/null 2>&1; then
    rm -f "$f"
    npx remotion render Main "$f" --codec=h264 --crf=19 --muted --frames="$start-$end" --log=error
    echo "CHUNK_${i}_DONE ($start-$end)"
  else
    echo "CHUNK_${i}_SKIP"
  fi
  i=$((i + 1))
  start=$((end + 1))
done

# 3) concat + mux
: > out/concat.txt
for f in out/chunks/chunk_*.mp4; do
  echo "file '$PWD/$f'" >> out/concat.txt
done
ffmpeg -y -v error -f concat -safe 0 -i out/concat.txt -i out/audio.wav \
  -c:v copy -c:a aac -b:a 192k -movflags +faststart out/final.mp4
echo "FINAL_DONE"
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 out/final.mp4
