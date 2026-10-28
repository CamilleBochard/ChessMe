"""Records written one per run, named after the day, never written over.

The refresh's summaries and the new games' measurements are both kept this
way, so a second run on the same day adds a file instead of replacing the
first one's.
"""

from datetime import date
from pathlib import Path


def new_dated_file(folder: Path, day: date) -> Path:
    """A file for the day's record that no earlier record holds: a second run the same day writes <day>-2.json."""
    path = folder / f"{day.isoformat()}.json"
    copy = 2
    while path.exists():
        path = folder / f"{day.isoformat()}-{copy}.json"
        copy += 1
    return path


def dated_files_in_order(folder: Path) -> list[Path]:
    """Every record, in the order the runs wrote them: by day, then by number within a day."""
    if not folder.exists():
        return []

    def written_order(path: Path) -> tuple[str, int]:
        # "2026-10-27" is the day's first record, "2026-10-27-2" its second.
        day = path.stem[:10]
        copy = 1
        if len(path.stem) > 10:
            copy = int(path.stem[11:])
        return day, copy

    return sorted(folder.glob("*.json"), key=written_order)
