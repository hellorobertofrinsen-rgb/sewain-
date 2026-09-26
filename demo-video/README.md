# Demo video (9:16, 1080×1920, ~50 s)

Made entirely by scripts: a scripted phone-sized browser session, captions drawn above the app,
an end card, and an original background track synthesised in `music.py` (no licensed music).

```bash
pip install playwright pillow numpy imageio-ffmpeg
cd frontend && npx expo export -p web && cd ..
python e2e/server.py &                 # the app on http://127.0.0.1:8055 with demo data
python demo-video/rooms.py             # flat room illustrations for the demo units
python demo-video/record.py            # -> demo-video/out/silent.mp4
python demo-video/music.py 50 demo-video/out/music.wav
ffmpeg -i demo-video/out/silent.mp4 -i demo-video/out/music.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart demo-video/out/sewain-demo.mp4
```

Change the flow or captions in `record.py` (`cap("…")` sets the caption, `tap()` shows a touch).
