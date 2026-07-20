#!/usr/bin/env python3
"""Montage the generated sprites into one review sheet on a checkerboard
(so transparency shows), labelled. Usage: python contact.py <dir> [out.png]"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

CELL, PAD, COLS = 320, 16, 3


def checker(w, h, sq=16):
    img = Image.new("RGB", (w, h), (235, 235, 238))
    d = ImageDraw.Draw(img)
    for y in range(0, h, sq):
        for x in range(0, w, sq):
            if (x // sq + y // sq) % 2:
                d.rectangle([x, y, x + sq, y + sq], fill=(215, 215, 220))
    return img


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "src/reskin/body")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src / "_contact.png"
    pngs = sorted(p for p in src.glob("*.png") if not p.name.startswith("_"))
    assert pngs, f"no sprites in {src}"

    rows = (len(pngs) + COLS - 1) // COLS
    W = COLS * (CELL + PAD) + PAD
    H = rows * (CELL + PAD + 22) + PAD
    sheet = checker(W, H)
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(pngs):
        r, c = divmod(i, COLS)
        x = PAD + c * (CELL + PAD)
        y = PAD + r * (CELL + PAD + 22)
        im = Image.open(p).convert("RGBA")
        im.thumbnail((CELL, CELL))
        sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
        d.text((x + 4, y + CELL + 4), p.stem, fill=(40, 40, 40))
    sheet.save(out)
    print(f"contact sheet -> {out} ({len(pngs)} sprites)")


if __name__ == "__main__":
    main()
