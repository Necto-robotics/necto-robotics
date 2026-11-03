"""Bake the Act 4 perception feed from a real worker-001 capture.

Act 4 is the one beat on the site that is NOT simulation: it shows a frame the
physical robot's IMX708 actually took, with the detections the pipeline
actually produced (part id + confidence, after the inventory/confidence/
geometry gates). Nothing here is invented for the website.

Unlike the other bakers this one is Python: the source frames live in the
necto-datasets tree and Pillow is already the toolchain there. Outputs are
committed, so a normal `npm run build` never needs it.

    python tools/build-feed.py

Writes site/public/media/feed.jpg (1280x720) and site/public/media/feed.json.
"""

from __future__ import annotations

import json
import pathlib
import sys

from PIL import Image

DATASETS = pathlib.Path(r"D:/Robotics/LEGOSwarm/necto-datasets")
CAPTURE = "3c7d4e33"
FRAME = "frame_0004"
OUT_W, OUT_H = 1280, 720
# Crop padding around the detected cluster, as a fraction of its larger side.
PAD = 0.55

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "media"


def main() -> int:
    label_path = DATASETS / "labels" / "real" / CAPTURE / f"{FRAME}.json"
    image_path = DATASETS / "frames" / "real" / CAPTURE / f"{FRAME}.jpg"
    if not label_path.exists() or not image_path.exists():
        print(f"missing source: {label_path} / {image_path}", file=sys.stderr)
        return 1

    label = json.loads(label_path.read_text())
    instances = [i for i in label["instances"] if i.get("in_frame", True)]
    image = Image.open(image_path).convert("RGB")
    W, H = image.size

    # Frame the crop on the parts themselves: the raw capture includes the
    # room behind the sweep, which is noise on a full-bleed hero.
    # Percentiles, not extremes: one stray part at the edge of the sweep would
    # otherwise drag the crop back out to the whole room.
    def pct(values: list[float], p: float) -> float:
        s = sorted(values)
        return s[min(int(p * (len(s) - 1)), len(s) - 1)]

    xs = [i["center_px"][0] for i in instances]
    ys = [i["center_px"][1] for i in instances]
    x_lo, x_hi = pct(xs, 0.08), pct(xs, 0.92)
    y_lo, y_hi = pct(ys, 0.08), pct(ys, 0.92)
    cx, cy = (x_lo + x_hi) / 2, (y_lo + y_hi) / 2
    span = max(x_hi - x_lo, (y_hi - y_lo) * OUT_W / OUT_H)
    crop_w = min(W, span * (1 + 2 * PAD))
    crop_h = crop_w * OUT_H / OUT_W
    if crop_h > H:
        crop_h, crop_w = H, H * OUT_W / OUT_H
    left = min(max(cx - crop_w / 2, 0), W - crop_w)
    top = min(max(cy - crop_h / 2, 0), H - crop_h)

    cropped = image.crop((round(left), round(top), round(left + crop_w), round(top + crop_h)))
    cropped = cropped.resize((OUT_W, OUT_H), Image.LANCZOS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cropped.save(OUT_DIR / "feed.jpg", quality=82, optimize=True, progressive=True)

    detections = []
    for inst in instances:
        x0, y0, x1, y1 = inst["bbox_px"]
        box = {
            "part": inst["ldraw_id"],
            "score": round(inst.get("score") or 0.0, 3),
            # Normalized to the cropped frame; boxes falling outside it are dropped.
            "x": (x0 - left) / crop_w,
            "y": (y0 - top) / crop_h,
            "w": (x1 - x0) / crop_w,
            "h": (y1 - y0) / crop_h,
        }
        if box["x"] < -0.02 or box["y"] < -0.02 or box["x"] + box["w"] > 1.02 or box["y"] + box["h"] > 1.02:
            continue
        detections.append(box)
    detections.sort(key=lambda b: -b["score"])

    meta = {
        "capture_id": CAPTURE,
        "frame": FRAME,
        "camera": label["camera"].get("model") or "IMX708",
        "source_px": [W, H],
        "width": OUT_W,
        "height": OUT_H,
        "hfov_deg": label["camera"].get("hfov_deg"),
        "label_source": label.get("label_source"),
        "scene_type": label.get("scene_type"),
        "detections": detections,
    }
    (OUT_DIR / "feed.json").write_text(json.dumps(meta, indent=2) + "\n")
    kb = (OUT_DIR / "feed.jpg").stat().st_size / 1024
    print(f"feed.jpg {OUT_W}x{OUT_H} {kb:.0f} KB · {len(detections)} detections from {CAPTURE}/{FRAME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
