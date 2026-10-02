"""Downloads the weights of every candidate Base Model listed in the manifest."""

import hashlib
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Candidate:
    name: str
    url: str
    sha256: str
    file_name: str


def fetch(candidates: list[Candidate], weights_dir: Path) -> None:
    """Downloads each candidate into weights_dir.

    A download whose sha256 differs from the manifest is refused before it is
    written: the measurements are only reproducible if every run uses exactly
    the weights the manifest names.
    """
    weights_dir.mkdir(parents=True, exist_ok=True)
    for candidate in candidates:
        destination = weights_dir / candidate.file_name
        if destination.exists() and _sha256(destination.read_bytes()) == candidate.sha256:
            continue

        with urllib.request.urlopen(candidate.url) as response:
            content = response.read()

        actual_sha256 = _sha256(content)
        if actual_sha256 != candidate.sha256:
            raise ValueError(
                f"{candidate.name}: downloaded file has sha256 {actual_sha256}, "
                f"the manifest expects {candidate.sha256}"
            )

        destination.write_bytes(content)


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
