#!/usr/bin/env python3
"""Convert SBTI source images to crisp pixel-art thumbnails.

Reads every PNG/JPG in public/id/, auto-crops the character (removing the
Chinese title at top), downsamples to a small grid, hard-quantizes the palette
to eliminate gradient noise, and writes the result to public/id/pixel/<CODE>.png.

The frontend displays these with CSS `image-rendering: pixelated` so the chunky
pixels are preserved on upscale. Two things make the output look like real
pixel art rather than a blurry photo:

1. Small grid size (GRID=48) so each pixel is visually large.
2. Color quantization with dithering OFF — every pixel snaps to one of PALETTE
   colors, producing hard, poster-like color blocks.
"""
from pathlib import Path
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "public" / "id"
DST = SRC / "pixel"
DST.mkdir(exist_ok=True)

# Target resolution. 256 keeps fine detail (facial features, props) while still
# producing clean raster pixels — the frontend renders this at ~84–98 px with
# `image-rendering: pixelated`, giving a crisp, detailed avatar.
GRID = 256

# Max distinct colors per avatar. Higher than the chunky 32-grid version so the
# extra resolution has enough palette to look clean.
PALETTE = 32

# Background is near-white; this threshold decides what counts as "content".
BG_THRESHOLD = 240

# Top crop fraction — skip the Chinese title region at the top of every source.
TOP_SKIP = 0.44


def bbox_content(img: Image.Image) -> tuple[int, int, int, int]:
    """Tight bbox of non-white pixels below the top title band."""
    w, h = img.size
    top_skip = int(h * TOP_SKIP)
    region = img.crop((0, top_skip, w, h)).convert("RGB")
    px = region.load()
    rw, rh = region.size

    min_x, min_y, max_x, max_y = rw, rh, 0, 0
    for y in range(rh):
        for x in range(rw):
            r, g, b = px[x, y]
            if r < BG_THRESHOLD or g < BG_THRESHOLD or b < BG_THRESHOLD:
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y

    if min_x >= max_x or min_y >= max_y:
        return (0, 0, w, h)
    return (min_x, min_y + top_skip, max_x + 1, max_y + 1 + top_skip)


def square_pad(img: Image.Image, color=(255, 255, 255)) -> Image.Image:
    w, h = img.size
    if w == h:
        return img
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), color)
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas


def to_pixel_art(img: Image.Image) -> Image.Image:
    """Downsample + quantize to produce a crisp pixel-art image."""
    # 1. Box-filter downsample preserves color averages better than nearest.
    small = img.resize((GRID, GRID), Image.BOX)

    # 2. Hard quantize: Image.Quantize.MEDIANCUT with dither=Dither.NONE gives
    #    poster-paint color blocks — exactly the pixel-art look we want.
    quantized = small.quantize(
        colors=PALETTE,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )

    # 3. Convert back to RGB so downstream tooling doesn't choke on palette mode.
    return quantized.convert("RGB")


def process_one(src_path: Path) -> None:
    code = src_path.stem
    img = Image.open(src_path).convert("RGB")

    bbox = bbox_content(img)
    cropped = img.crop(bbox)

    margin = int(max(cropped.size) * 0.06)
    bg = Image.new("RGB", (cropped.size[0] + margin * 2, cropped.size[1] + margin * 2), (255, 255, 255))
    bg.paste(cropped, (margin, margin))

    squared = square_pad(bg)
    pixelated = to_pixel_art(squared)

    out_path = DST / f"{code}.png"
    pixelated.save(out_path, "PNG", optimize=True)
    print(f"  {code}: {img.size} -> bbox {bbox} -> {pixelated.size} -> {out_path.name}")


def main() -> None:
    images = sorted([p for p in SRC.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg") and p.is_file()])
    print(f"Processing {len(images)} images from {SRC}")
    for p in images:
        process_one(p)
    print(f"\nDone. Output: {DST}  (grid={GRID}, palette={PALETTE})")


if __name__ == "__main__":
    main()
