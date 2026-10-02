"""Reports the size of every converted model, as a visitor would download it.

Run from the repository root, after the models are converted:

    python -m pipeline.model_sizes

A static server sends the file compressed when the browser allows it, so the
raw size overstates the download. Gzip and Brotli are both reported at their
highest level, which is what a server precompressing static files would use.
"""

import gzip
from pathlib import Path

import brotli

from pipeline.convert_maia1 import ONNX_DIR

MEGABYTE = 1_000_000


def megabytes(size_in_bytes: int) -> str:
    return f"{size_in_bytes / MEGABYTE:.2f} MB"


if __name__ == "__main__":
    print("| Model | ONNX | gzip -9 | brotli -11 |")
    print("|---|---|---|---|")
    for onnx_path in sorted(ONNX_DIR.glob("*.onnx")):
        content = onnx_path.read_bytes()
        gzip_size = len(gzip.compress(content, compresslevel=9))
        brotli_size = len(brotli.compress(content, quality=11))
        print(f"| {onnx_path.stem} | {megabytes(len(content))} | {megabytes(gzip_size)} | {megabytes(brotli_size)} |")
