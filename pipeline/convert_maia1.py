"""Converts every fetched Maia-1 candidate to ONNX.

Run from the repository root, after scripts/build_lc0.sh and
python -m pipeline.fetch_models:

    python -m pipeline.convert_maia1

Each candidate yields two files:
  models/onnx/<name>.onnx         the model the Move-Selection Engine loads
  models/verify/<name>.onnx.pb.gz the same ONNX graph wrapped in lc0's format,
                                  because lc0 only runs a graph it can read
                                  from its own container
"""

import subprocess
from pathlib import Path

from pipeline.fetch_models import MANIFEST_PATH, REPOSITORY_ROOT, WEIGHTS_DIR, read_manifest

LC0 = REPOSITORY_ROOT / "tools" / "lc0"
ONNX_DIR = REPOSITORY_ROOT / "models" / "onnx"
VERIFY_DIR = REPOSITORY_ROOT / "models" / "verify"

# Pinned rather than left to lc0's default, so that upgrading lc0 cannot
# silently produce a file the browser runtime no longer reads.
ONNX_OPSET = 17

# The tensor names lc0 gives a Maia-1 network, as reported by `lc0 describenet`.
INPUT_NAME = "/input/planes"
POLICY_NAME = "/output/policy"
WDL_NAME = "/output/wdl"


def convert(weights_path: Path, onnx_path: Path, wrapped_path: Path) -> None:
    subprocess.run(
        [
            str(LC0),
            "leela2onnx",
            f"--input={weights_path}",
            f"--output={onnx_path}",
            f"--onnx-opset={ONNX_OPSET}",
        ],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            str(LC0),
            "onnx2leela",
            f"--input={onnx_path}",
            f"--output={wrapped_path}",
            "--input-format=INPUT_CLASSICAL_112_PLANE",
            "--policy-format=POLICY_CONVOLUTION",
            "--value-format=VALUE_WDL",
            f"--onnx-input={INPUT_NAME}",
            f"--onnx-output-policy={POLICY_NAME}",
            f"--onnx-output-wdl={WDL_NAME}",
        ],
        check=True,
        capture_output=True,
    )


if __name__ == "__main__":
    ONNX_DIR.mkdir(parents=True, exist_ok=True)
    VERIFY_DIR.mkdir(parents=True, exist_ok=True)

    maia1_candidates = [candidate for candidate in read_manifest(MANIFEST_PATH) if candidate.name.startswith("maia1-")]
    for candidate in maia1_candidates:
        onnx_path = ONNX_DIR / f"{candidate.name}.onnx"
        wrapped_path = VERIFY_DIR / f"{candidate.name}.onnx.pb.gz"
        convert(WEIGHTS_DIR / candidate.file_name, onnx_path, wrapped_path)
        print(f"{candidate.name:>12}: {onnx_path}")
