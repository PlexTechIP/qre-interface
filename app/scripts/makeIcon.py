#!/usr/bin/env python3
"""Generate the QRE Interface app icon: an atom (nucleus + three orbits) in a
circle, in QRE blue.

Draws at 4x and downsamples for clean anti-aliasing. Emits:
  build-resources/icon.png   1024x1024 master
  build-resources/icon.ico   multi-size Windows icon

The macOS .icns is assembled from icon.png by scripts/makeIcon.sh (iconutil).
"""

from pathlib import Path

from PIL import Image, ImageDraw

BLUE = (61, 138, 170, 255)  # QRE steel blue
WHITE = (255, 255, 255, 255)
SCALE = 4
SIZE = 1024 * SCALE


def draw_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    center = SIZE // 2

    # Background disc: white fill with a blue ring.
    margin = int(SIZE * 0.055)
    ring = int(SIZE * 0.020)
    draw.ellipse(
        [margin, margin, SIZE - margin, SIZE - margin],
        fill=WHITE,
        outline=BLUE,
        width=ring,
    )

    # Three orbital ellipses, each drawn axis-aligned on its own layer then
    # rotated, so the strokes stay even after rotation.
    semi_major = int(SIZE * 0.345)
    semi_minor = int(SIZE * 0.130)
    orbit_width = int(SIZE * 0.026)
    for angle in (0, 60, 120):
        layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse(
            [
                center - semi_major,
                center - semi_minor,
                center + semi_major,
                center + semi_minor,
            ],
            outline=BLUE,
            width=orbit_width,
        )
        img.alpha_composite(layer.rotate(angle, resample=Image.BICUBIC, center=(center, center)))

    # Nucleus.
    nucleus = int(SIZE * 0.052)
    draw.ellipse(
        [center - nucleus, center - nucleus, center + nucleus, center + nucleus],
        fill=BLUE,
    )

    return img.resize((1024, 1024), Image.LANCZOS)


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "build-resources"
    out_dir.mkdir(parents=True, exist_ok=True)
    icon = draw_icon()
    icon.save(out_dir / "icon.png")
    icon.save(
        out_dir / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Wrote {out_dir / 'icon.png'} and {out_dir / 'icon.ico'}")


if __name__ == "__main__":
    main()
