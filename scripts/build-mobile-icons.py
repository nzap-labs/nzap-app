"""Build NZAP's Android and iOS app icons from the NZAP Labs logo source.

    python scripts/build-mobile-icons.py ../nzap-engine/brand/src/dark.png   # needs Pillow

The tile matches nzap-engine's `brand/build_brand.py` app icon (dark stage,
vertical sheen, studio light, chrome NZ mark) but is drawn for phones:

- iOS: full-bleed and opaque; the system rounds the corners.
- Android adaptive: the mark alone on a transparent foreground, inside the
  66 % safe zone, over the stage drawn as the background layer. Launchers
  pick the mask (circle, squircle, …).
- Android legacy (API < 26): the tile, rounded and round.

The desktop development build's icons (`src-tauri/icons/*.png`, `.icns`,
`.ico`) are nzap-engine's own, copied as they are.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "src-tauri/gen/android/app/src/main/res"
ICONS = ROOT / "src-tauri/icons"

source = Image.open(sys.argv[1] if len(sys.argv) > 1 else "../nzap-engine/brand/src/dark.png").convert("RGBA")


def solid_alpha(image, threshold=24):
    """The faint alpha haze over the source canvas becomes fully clear."""
    r, g, b, a = image.split()
    a = a.point(lambda v: 0 if v < threshold else min(255, int((v - threshold) * 255 / (255 - threshold))))
    return Image.merge("RGBA", (r, g, b, a))


def mark_only(image):
    """The NZ mark: everything above the band of empty rows before the wordmark."""
    alpha = image.getchannel("A")
    filled = [alpha.crop((0, y, image.width, y + 1)).getbbox() is not None for y in range(image.height)]
    y = image.height - 1
    while y > 0 and not filled[y]:
        y -= 1
    while y > 0 and filled[y]:
        y -= 1
    while y > 0 and not filled[y]:
        y -= 1
    mark = image.crop((0, 0, image.width, y + 1))
    return mark.crop(mark.getchannel("A").getbbox())


MARK = mark_only(solid_alpha(source))


def placed(size, fill):
    """The mark centred on a transparent square, `fill` of the side wide."""
    scale = size * fill / max(MARK.size)
    mark = MARK.resize((round(MARK.width * scale), round(MARK.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


def stage(size):
    """The dark stage: ink, a vertical sheen and a soft light behind the mark."""
    base = Image.new("RGBA", (size, size), (12, 12, 14, 255))
    sheen = Image.linear_gradient("L").resize((size, size)).point(lambda v: int(26 * (1 - v / 255)))
    base = Image.composite(Image.new("RGBA", (size, size), (60, 60, 68, 255)), base, sheen)
    glow = Image.new("L", (size, size), 0)
    ImageDraw.Draw(glow).ellipse((size * 0.12, size * 0.10, size * 0.88, size * 0.86), fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.14))
    return Image.composite(Image.new("RGBA", (size, size), (120, 122, 132, 255)), base, glow)


def tile(size, fill):
    image = stage(size)
    image.alpha_composite(placed(size, fill))
    return image


def masked(image, shape):
    big = image.width * 4
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    if shape == "round":
        draw.ellipse((0, 0, big - 1, big - 1), fill=255)
    else:
        draw.rounded_rectangle((0, 0, big - 1, big - 1), int(big * 0.18), fill=255)
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    out.paste(image, (0, 0), mask.resize(image.size, Image.LANCZOS))
    return out


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


# iOS: opaque, full bleed. The mark is a little smaller than on desktop
# because the system mask cuts the corners.
ios = tile(1024, 0.62).convert("RGB")
for path in sorted((ICONS / "ios").glob("*.png")):
    with Image.open(path) as current:
        size = current.size
    save(ios.resize(size, Image.LANCZOS), path)

# Android adaptive icon: 108 dp layers, the visible part is the middle 72 dp
# and the safe zone the middle 66 dp.
densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
foreground = placed(1024, 0.50)
background = stage(1024)
legacy = tile(1024, 0.70)
for name, scale in densities.items():
    layer = round(108 * scale)
    icon = round(48 * scale)
    folder = RES / f"mipmap-{name}"
    save(foreground.resize((layer, layer), Image.LANCZOS), folder / "ic_launcher_foreground.png")
    save(background.resize((layer, layer), Image.LANCZOS).convert("RGB"), folder / "ic_launcher_background.png")
    save(masked(legacy, "square").resize((icon, icon), Image.LANCZOS), folder / "ic_launcher.png")
    save(masked(legacy, "round").resize((icon, icon), Image.LANCZOS), folder / "ic_launcher_round.png")

print("icons written")

# Status-bar icon for the keep-alive notification: the mark's silhouette in
# white (Android draws small icons from alpha only). 24 dp, mark in 20 dp.
silhouette = Image.new("RGBA", MARK.size, (255, 255, 255, 0))
silhouette.putalpha(MARK.getchannel("A"))
PLUGIN_RES = ROOT / "plugins/nzap-mobile/android/src/main/res"
for name, scale in densities.items():
    size = round(24 * scale)
    inner = round(20 * scale)
    factor = inner / max(silhouette.size)
    small = silhouette.resize((round(silhouette.width * factor), round(silhouette.height * factor)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    canvas.alpha_composite(small, ((size - small.width) // 2, (size - small.height) // 2))
    save(canvas, PLUGIN_RES / f"drawable-{name}" / "ic_stat_nzap.png")
print("status icon written")
