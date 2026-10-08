"""Cut actual DSH screen footage; never generate or replace UI content.

Usage: python scripts/process-desktop-demo.py FFMPEG RAW_MP4 EDIT_JSON
EDIT_JSON: {"segments": [{"start": 0, "duration": 5}, ...]}
Segments must be chronological and within the original recording.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def sha256(path):
    return hashlib.file_digest(path.open("rb"), "sha256").hexdigest()


def main():
    ffmpeg, raw, edit_path = sys.argv[1:]
    raw, edit_path = Path(raw), Path(edit_path)
    edit = json.loads(edit_path.read_text(encoding="utf-8"))
    segments = edit["segments"]
    duration = sum(s["duration"] for s in segments)
    assert 30 <= duration <= 60, duration
    end = 0
    for s in segments:
        assert s["start"] >= end and s["duration"] > 0
        end = s["start"] + s["duration"]
    root = Path(__file__).resolve().parents[1]
    assets = root / "assets"
    video = assets / "desktop-agent-v090.mp4"
    gif = assets / "desktop-agent-v090.gif"
    poster = assets / "desktop-agent-v090.png"
    filters = []
    for i, s in enumerate(segments):
        filters.append(
            f"[0:v]trim=start={s['start']}:duration={s['duration']},"
            f"setpts=PTS-STARTPTS[v{i}]"
        )
    inputs = "".join(f"[v{i}]" for i in range(len(segments)))
    filters.append(
        f"{inputs}concat=n={len(segments)}:v=1:a=0,"
        "scale=1280:-2:flags=lanczos,setsar=1,fps=15[out]"
    )
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-filter_complex", ";".join(filters),
        "-map", "[out]", "-an", "-c:v", "libx264", "-crf", "20",
        "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-map_metadata", "-1", str(video),
    ], check=True)
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-vf",
        "fps=2,split[a][b];[a]palettegen=stats_mode=diff[p];"
        "[b][p]paletteuse=dither=bayer:bayer_scale=5", "-loop", "0", str(gif),
    ], check=True)
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", str(edit.get("posterAt", 12)), "-i", str(video),
        "-frames:v", "1", "-update", "1", str(poster),
    ], check=True)
    manifest = {
        "method": "Actual DSH Desktop screen recording; Agent task submitted through UI",
        "recordedDate": "2026-10-08",
        "pluginVersion": "0.9.0 (visible installed/running in Desktop UI)",
        "rawSha256": sha256(raw),
        "durationSeconds": duration,
        "segments": segments,
        "posterAt": edit.get("posterAt", 12),
        "edits": [
            "Chronological cuts remove setup, waiting and redundant holds",
            "No UI, tool output or Agent response generated or replaced",
            "Silent video resized to 1280 pixels wide, 15 fps; GIF sampled at 2 fps",
            "Elapsed wall time is not represented by edited playback duration",
        ],
        "captureOperation": "User started/stopped Windows Snipping Tool; assistant operated DSH",
        "toolResult": {"usedChars": 2347, "budgetChars": 5000},
        "outputs": {
            p.name: {"sha256": sha256(p), "bytes": p.stat().st_size}
            for p in [video, gif, poster]
        },
    }
    (assets / "desktop-agent-v090.provenance.json").write_bytes(
        (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
