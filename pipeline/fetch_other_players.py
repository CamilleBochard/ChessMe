"""Samples games of other players at Camille's level from the Lichess database.

Run from the repository root (needs curl and zstd):

    python -m pipeline.fetch_other_players

Lichess publishes every rated game of each month as one zstd-compressed PGN
file of about 30 GB at https://database.lichess.org, in the public domain.
The file is streamed from its start and the download stops as soon as the
sample is full, after the first few hundred megabytes. A month's file never
changes once published, so the same month and settings give the same sample.

Written to data/dataset/other-players.jsonl, one game per line, which the
style discriminator reads.
"""

import argparse
import io
import json
import subprocess
from pathlib import Path

from pipeline.other_players import sample_other_players

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
OTHER_PLAYERS_PATH = REPOSITORY_ROOT / "data" / "dataset" / "other-players.jsonl"

DATABASE_URL = "https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"

# The latest complete month when the sample was first drawn.
MONTH = "2026-09"

# The middle 80% of Camille's own Lichess ratings in the dataset's 10-minute
# games: 10th percentile 1191, median 1261, 90th percentile 1361. The extremes
# are left out because a new account's provisional rating reached 1900.
RATING_RANGE = (1190, 1360)

CAMILLE_ON_LICHESS = "Punkycam"

GAMES_WANTED = 3000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--month", default=MONTH, help=f"the database month to sample, YYYY-MM (default {MONTH})")
    parser.add_argument("--games", type=int, default=GAMES_WANTED, help=f"how many games to sample (default {GAMES_WANTED})")
    parser.add_argument("--out", type=Path, default=OTHER_PLAYERS_PATH)
    arguments = parser.parse_args()

    url = DATABASE_URL.format(month=arguments.month)
    download = subprocess.Popen(["curl", "--silent", "--fail", url], stdout=subprocess.PIPE)
    decompression = subprocess.Popen(["zstd", "--decompress", "--stdout"], stdin=download.stdout, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    # Closed here so that curl, not this process, holds the only read end
    # of its pipe, and stops once zstd does.
    download.stdout.close()

    pgn_stream = io.TextIOWrapper(decompression.stdout, encoding="utf-8")
    games = sample_other_players(pgn_stream, rating_range=RATING_RANGE, excluded_player=CAMILLE_ON_LICHESS, games_wanted=arguments.games)

    # The sample is full: the rest of the month is not needed.
    decompression.kill()
    download.kill()

    if len(games) < arguments.games:
        raise SystemExit(f"Only {len(games)} games matched in {url}")

    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(game) + "\n" for game in games]
    arguments.out.write_text("".join(lines), encoding="utf-8")

    print(f"Sampled {len(games)} games from {url}")
    print(f"Players rated {RATING_RANGE[0]}-{RATING_RANGE[1]} at 10 minutes, one game each, {CAMILLE_ON_LICHESS} left out")
    print(f"Written to {arguments.out}")


if __name__ == "__main__":
    main()
