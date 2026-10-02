import hashlib
from pathlib import Path

import pytest

from pipeline.fetch_models import Candidate, fetch


def published_file(directory: Path, name: str, content: bytes) -> tuple[str, str]:
    """Writes a file standing in for a published weight file; returns its URL and sha256."""
    directory.mkdir(exist_ok=True)
    path = directory / name
    path.write_bytes(content)
    return path.as_uri(), hashlib.sha256(content).hexdigest()


def test_stores_a_download_whose_hash_matches(tmp_path):
    url, sha256 = published_file(tmp_path / "published", "maia-1300.pb.gz", b"weights")
    candidate = Candidate(name="maia1-1300", url=url, sha256=sha256, file_name="maia-1300.pb.gz")

    fetch([candidate], tmp_path / "weights")

    assert (tmp_path / "weights" / "maia-1300.pb.gz").read_bytes() == b"weights"


def test_refuses_a_download_whose_hash_differs(tmp_path):
    url, _ = published_file(tmp_path / "published", "maia-1300.pb.gz", b"tampered weights")
    expected_sha256 = hashlib.sha256(b"weights").hexdigest()
    candidate = Candidate(name="maia1-1300", url=url, sha256=expected_sha256, file_name="maia-1300.pb.gz")

    with pytest.raises(ValueError, match="maia1-1300"):
        fetch([candidate], tmp_path / "weights")

    assert not (tmp_path / "weights" / "maia-1300.pb.gz").exists()


def test_keeps_a_file_already_fetched_without_downloading_it_again(tmp_path):
    url, sha256 = published_file(tmp_path / "published", "maia-1300.pb.gz", b"weights")
    candidate = Candidate(name="maia1-1300", url=url, sha256=sha256, file_name="maia-1300.pb.gz")
    fetch([candidate], tmp_path / "weights")
    (tmp_path / "published" / "maia-1300.pb.gz").unlink()

    fetch([candidate], tmp_path / "weights")

    assert (tmp_path / "weights" / "maia-1300.pb.gz").read_bytes() == b"weights"
