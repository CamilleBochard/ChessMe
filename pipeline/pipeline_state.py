"""Keeps what the monthly refresh needs from one run to the next as assets of the pipeline-state release.

The Stockfish caches take hours to rebuild and the served model's records
minutes; neither is in the repository. The Actions cache is no place for
them, since it is evicted after seven days unused and a run is a month
apart. So each is kept, compressed, as an asset of a release of its own:

    python -m pipeline.pipeline_state restore
    python -m pipeline.pipeline_state save --stamp 2026-11-01-1234

restore downloads the latest copy of each file into place. save uploads a
new copy of each under a new name, and only once every upload has succeeded
deletes the older copies: a run that fails while saving leaves the previous
copies as they were. The monthly refresh saves only after a run that
deployed. save creates the release the first time. Both use the gh CLI.
"""

import argparse
import gzip
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

# The standard library only, so the job that saves needs no install.
REPOSITORY_ROOT = Path(__file__).resolve().parent.parent

RELEASE = "pipeline-state"

# What persists, by where it lives in the repository.
KEPT_FILES = [
    REPOSITORY_ROOT / "data" / "analysis" / "stockfish-19-depth-18.jsonl",
    REPOSITORY_ROOT / "data" / "analysis" / "stockfish-19-lite-wasm-depth-14.jsonl",
    REPOSITORY_ROOT / "data" / "dataset" / "move-probabilities" / "fine-tuned-test.jsonl",
]


def asset_name(file_name: str, stamp: str) -> str:
    """The name a copy of the file is saved under: the file's name, the run that saved it, compressed."""
    return f"{file_name}.{stamp}.gz"


def _file_name_of(asset: str) -> str:
    # "stockfish-19-depth-18.jsonl.2026-11-01-1234.gz" -> "stockfish-19-depth-18.jsonl"
    return asset.removesuffix(".gz").rsplit(".", 1)[0]


def latest_assets(assets: list[str]) -> dict[str, str]:
    """The latest copy of each file among the release's assets, by the file's name.

    Stamps begin with the day, so the latest sorts last.
    """
    latest = {}
    for asset in sorted(assets):
        latest[_file_name_of(asset)] = asset
    return latest


def stale_assets(assets: list[str], just_saved: list[str]) -> list[str]:
    """The copies to delete once the new ones are saved: every other copy of a file just saved."""
    saved_files = {_file_name_of(asset) for asset in just_saved}
    return [asset for asset in assets if _file_name_of(asset) in saved_files and asset not in just_saved]


def _release_assets() -> list[str]:
    listing = subprocess.run(
        ["gh", "release", "view", RELEASE, "--json", "assets"], capture_output=True, text=True, check=True
    )
    return [asset["name"] for asset in json.loads(listing.stdout)["assets"]]


def _release_exists() -> bool:
    return subprocess.run(["gh", "release", "view", RELEASE], capture_output=True).returncode == 0


def restore() -> None:
    latest = latest_assets(_release_assets())
    with tempfile.TemporaryDirectory() as downloads:
        for path in KEPT_FILES:
            asset = latest.get(path.name)
            if asset is None:
                raise SystemExit(f"The {RELEASE} release holds no copy of {path.name}")
            subprocess.run(["gh", "release", "download", RELEASE, "--pattern", asset, "--dir", downloads], check=True)
            path.parent.mkdir(parents=True, exist_ok=True)
            with gzip.open(Path(downloads) / asset, "rb") as compressed, open(path, "wb") as restored:
                shutil.copyfileobj(compressed, restored)
            print(f"Restored {path.relative_to(REPOSITORY_ROOT)} from {asset}")


def save(stamp: str) -> None:
    if not _release_exists():
        notes = "What the monthly refresh keeps between runs: the Stockfish caches and the served model's records."
        subprocess.run(["gh", "release", "create", RELEASE, "--title", "Pipeline state", "--notes", notes, "--latest=false"], check=True)
    assets_before = _release_assets()
    saved = []
    with tempfile.TemporaryDirectory() as uploads:
        for path in KEPT_FILES:
            asset = Path(uploads) / asset_name(path.name, stamp)
            with open(path, "rb") as original, gzip.open(asset, "wb") as compressed:
                shutil.copyfileobj(original, compressed)
            subprocess.run(["gh", "release", "upload", RELEASE, str(asset)], check=True)
            saved.append(asset.name)
            print(f"Saved {path.relative_to(REPOSITORY_ROOT)} as {asset.name}")
    # Only now that every new copy is up.
    for asset in stale_assets(assets_before + saved, saved):
        subprocess.run(["gh", "release", "delete-asset", RELEASE, asset, "--yes"], check=True)
        print(f"Deleted the older copy {asset}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore or save what the monthly refresh keeps between runs.")
    parser.add_argument("action", choices=["restore", "save"])
    parser.add_argument("--stamp", help="names the saved copies, the day first, such as 2026-11-01-1234")
    arguments = parser.parse_args()
    if arguments.action == "restore":
        restore()
    else:
        if arguments.stamp is None:
            parser.error("save needs --stamp")
        save(arguments.stamp)
