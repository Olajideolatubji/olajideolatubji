#!/bin/bash
# QC pass for out/final.mp4: stream specs, runtime, audio peaks, QC frames.
set -e
F=out/final.mp4
echo "== container =="
ffprobe -v error -show_entries format=duration,size,bit_rate -of default=noprint_wrappers=1 "$F"
echo "== streams =="
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,sample_rate,channels -of default=noprint_wrappers=1 "$F"
echo "== audio levels =="
ffmpeg -i "$F" -af volumedetect -f null /dev/null 2>&1 | grep -E 'mean_volume|max_volume'
echo "== QC frames =="
mkdir -p out/qc
# 0:00, chapter boundaries (+1.5s into each so the ledger page is visible), final minute, last frame
for t in 0.5 49.5 175.5 307.5 448.5 573.5 755 790 806 811; do
  ffmpeg -y -v error -ss "$t" -i "$F" -frames:v 1 "out/qc/f_${t}.png"
done
ls out/qc/
