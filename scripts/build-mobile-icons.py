"""Build NZAP's app icons and the in-app dark-mode mark from the NZAP Labs logo.

    python scripts/build-mobile-icons.py [scripts/brand/nzap-labs-dark.webp]   # needs Pillow + NumPy

The source is the silver NZ ribbon (and "NZAP LABS" wordmark) on black. Its
brightness becomes the alpha channel, so the mark and its glow sit on any dark
surface exactly as they do on the black source. The tile is a dark stage
(vertical sheen, studio light) with that mark, drawn for phones:

- iOS: full-bleed and opaque; the system rounds the corners.
- Android adaptive: the mark alone on a transparent foreground, inside the
  66 % safe zone, over the stage drawn as the background layer. Launchers
  pick the mask (circle, squircle, …).
- Android legacy (API < 26): the tile, rounded and round.

- Desktop development build: the same tile as `src-tauri/icons/*.png`, `.icns`
  and `.ico`, plus the browser favicon.
- In app (dark mode): `src/assets/brand/nzap-mark-dark-160.png`. The light mode
  mark is a separate asset and is left alone.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "src-tauri/gen/android/app/src/main/res"
ICONS = ROOT / "src-tauri/icons"
BRAND = ROOT / "src/assets/brand"
DEFAULT_SOURCE = ROOT / "scripts/brand/nzap-labs-dark.webp"


def mark_from_black(path, floor=20):
    """The NZ mark of a logo drawn on pure black, as straight RGBA.

    Alpha is the brightest channel and the colour is divided by it, so
    compositing over black gives back the source pixel and over any near-black
    surface it differs by a few levels at most. Only the rows above the
    wordmark are kept, trimmed to the mark and its glow.
    """
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    alpha = rgb.max(axis=2)
    alpha[alpha < floor] = 0
    rows = np.flatnonzero(alpha.max(axis=1))
    end = rows[0]
    while end + 1 < len(alpha) and alpha[end + 1].any():
        end += 1  # the first run of non-empty rows is the mark; the wordmark follows a gap
    rgb, alpha = rgb[rows[0] : end + 1], alpha[rows[0] : end + 1]
    cols = np.flatnonzero(alpha.max(axis=0))
    rgb, alpha = rgb[:, cols[0] : cols[-1] + 1], alpha[:, cols[0] : cols[-1] + 1]
    colour = rgb * (255 / np.maximum(alpha, 1))[..., None]
    out = np.dstack([np.clip(colour, 0, 255), alpha]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def silhouette_of(mark, level=90):
    """The solid shape of the mark without its glow, for single-colour uses."""
    solid = mark.getchannel("A").point(lambda v: 255 if v > level else 0)
    solid = solid.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))  # close the shading seams
    return solid


source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
MARK = mark_from_black(source)


def placed(size, fill):
    """The mark centred on a transparent square, `fill` of the side wide."""
    scale = size * fill / max(MARK.size)
    mark = MARK.resize((round(MARK.width * scale), round(MARK.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


def stage(size, zoom=1.0):
    """The dark stage: ink, a vertical sheen and a soft light behind the mark.

    `zoom` shrinks the light toward the centre, so a layer that is mostly
    masked away (Android adaptive) keeps the same light inside what shows.
    """
    base = Image.new("RGBA", (size, size), (12, 12, 14, 255))
    sheen = Image.linear_gradient("L").resize((size, size)).point(lambda v: int(26 * (1 - v / 255)))
    base = Image.composite(Image.new("RGBA", (size, size), (60, 60, 68, 255)), base, sheen)
    glow = Image.new("L", (size, size), 0)
    c = size / 2
    box = (size * -0.38, size * -0.40, size * 0.38, size * 0.36)  # about the centre
    ImageDraw.Draw(glow).ellipse(tuple(c + v * zoom for v in box), fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.14 * zoom))
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
background = stage(1024, zoom=72 / 108)
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
silhouette.putalpha(silhouette_of(MARK))
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

# Desktop development build and the browser tab: the rounded tile.
desktop = masked(legacy, "square")
for name, size in {"32x32": 32, "64x64": 64, "128x128": 128, "128x128@2x": 256, "icon": 512}.items():
    save(desktop.resize((size, size), Image.LANCZOS), ICONS / f"{name}.png")
desktop.save(ICONS / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 256)])
tile(1024, 0.70).save(ICONS / "icon.icns")
save(desktop.resize((64, 64), Image.LANCZOS), ROOT / "public/favicon.png")
print("desktop icons written")

# In app, dark mode: the mark alone on a square, glow included. (Light mode
# keeps its own black rendition, `nzap-mark-light-160.png`.)
save(placed(160, 1.0), BRAND / "nzap-mark-dark-160.png")
print("dark mark written")
