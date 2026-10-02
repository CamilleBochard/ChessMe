"""Downloads the weights of every candidate Base Model listed in the manifest."""

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
    weights_dir.mkdir(parents=True, exist_ok=True)
    for candidate in candidates:
        with urllib.request.urlopen(candidate.url) as response:
            content = response.read()
        (weights_dir / candidate.file_name).write_bytes(content)
