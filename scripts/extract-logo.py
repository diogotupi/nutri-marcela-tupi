"""Extract the supplied brand artwork and its PDF soft masks without redrawing it.

Usage: python scripts/extract-logo.py "path/to/brand.pdf"
Dependencies: PyMuPDF, Pillow. Outputs go to assets/.
"""
import argparse
import io
from pathlib import Path

import pymupdf
from PIL import Image, ImageOps


def artwork(document, page_number):
    images = document[page_number].get_images(full=True)
    if len(images) != 1:
        raise ValueError(f"Page {page_number + 1}: expected one original logo image")
    xref, mask = images[0][:2]
    pixels = pymupdf.Pixmap(document, xref)
    if mask:
        pixels = pymupdf.Pixmap(pixels, pymupdf.Pixmap(document, mask))
    image = Image.open(io.BytesIO(pixels.tobytes("png"))).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        raise ValueError("Empty logo")
    # Trim only transparent margins, retaining the original pixels and colours.
    return ImageOps.expand(image.crop(bounds), border=6, fill=(0, 0, 0, 0))


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("pdf", type=Path)
    source = args.parse_args().pdf
    destination = Path(__file__).resolve().parent.parent / "assets"
    with pymupdf.open(source) as document:
        if len(document) != 3:
            raise ValueError("Expected the supplied PDF with three logo variants")
        signature, horizontal, circular = [artwork(document, i) for i in range(3)]
    for image, name in [(signature, "logo-signature.png"), (horizontal, "logo-horizontal.png"),
                        (circular, "logo.png"), (circular, "logo-transparent.png")]:
        image.save(destination / name, optimize=True)
    white = Image.new("RGBA", circular.size, (255, 255, 255, 0))
    white.putalpha(circular.getchannel("A"))
    white.save(destination / "logo-white-transparent.png", optimize=True)
    for size, name in [(16, "favicon-16.png"), (32, "favicon-32.png"), (180, "apple-touch-icon.png")]:
        icon = ImageOps.contain(circular, (size, size), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255) if size == 180 else (0, 0, 0, 0))
        canvas.alpha_composite(icon, ((size - icon.width) // 2, (size - icon.height) // 2))
        canvas.save(destination / name, optimize=True)
    print("Extracted three original transparent logos and generated site icons.")


if __name__ == "__main__":
    main()
