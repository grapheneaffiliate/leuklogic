set -e
cd /tmp/claude-1000/-mnt-c-Users-atchi-Harness/753d90bc-7bba-44dc-abfd-7db53e82f114/scratchpad/site/assets
# film: 2-pass to ~540 kbps video + 48k mono AAC
nice ffmpeg -v error -y -i /mnt/c/Users/atchi/Harness/media/si-robotics/v01/v01_master.mp4 -vf "scale=720:1280:flags=lanczos,fps=24" -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -b:v 540k -maxrate 800k -bufsize 1600k -pass 1 -an -f null /dev/null
nice ffmpeg -v error -y -i /mnt/c/Users/atchi/Harness/media/si-robotics/v01/v01_master.mp4 -vf "scale=720:1280:flags=lanczos,fps=24" -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -b:v 540k -maxrate 800k -bufsize 1600k -pass 2 -c:a aac -b:a 48k -ac 1 -ar 44100 -movflags +faststart film-v01.mp4
# hero loop: clean clips, 4s from each, muted
nice ffmpeg -v error -y $(for i in 1 2 3 4 5 6; do echo -n "-t 4 -i /mnt/c/Users/atchi/Harness/media/si-robotics/v01/clips/s$i.mp4 "; done) -filter_complex "$(for i in 0 1 2 3 4 5; do echo -n "[$i:v]scale=720:1280:flags=lanczos,fps=24,setsar=1[v$i];"; done)$(for i in 0 1 2 3 4 5; do echo -n "[v$i]"; done)concat=n=6:v=1:a=0[o]" -map "[o]" -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -crf 31 -maxrate 650k -bufsize 1300k -an -movflags +faststart hero-loop.mp4
echo done > enc.done
