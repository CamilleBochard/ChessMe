"""Prints the aggregate counts of the stored Session Games, for the write-up.

Run against a copy of the database fetched from the VPS:

    python -m pipeline.report_session_games --database data/session-games.sqlite

The counts are printed as JSON, so the write-up can read them as they are.
"""

import argparse
import json
from pathlib import Path

from pipeline.session_games import open_store, session_game_counts

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Print the aggregate counts of the stored Session Games.")
    parser.add_argument("--database", type=Path, required=True, help="the SQLite file the games are stored in")
    arguments = parser.parse_args()

    if not arguments.database.exists():
        parser.error(f"no database at {arguments.database}")

    store = open_store(arguments.database)
    counts = session_game_counts(store)
    store.close()
    print(json.dumps(counts, indent=2))
