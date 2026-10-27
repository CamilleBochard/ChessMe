"""Fetches the games Camille has played since the last refresh, from Chess.com and Lichess.

Chess.com's public API is read anonymously. The Lichess export needs
Camille's personal token, read from the LICHESS_TOKEN environment variable
and never written anywhere. New games are written to new dated files in
data/raw, and the files already there are never rewritten, so every figure
measured on them stays reproducible. Games played against the Bot on the
site are Session Games and never come here: they are not Camille's games.

Run alone, from the repository root, to fetch without rebuilding anything:

    export LICHESS_TOKEN="$(cat ~/.config/chessme/lichess-token)"
    python -m pipeline.fetch_games

pipeline/refresh_games.py runs it first, then rebuilds everything from the games.
"""

import io
import json
import re
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import chess.pgn

from pipeline.dataset import game_id, source_of

CHESSCOM_PLAYER = "punkycam"
LICHESS_PLAYER = "Punkycam"
CHESSCOM_ARCHIVES = f"https://api.chess.com/pub/player/{CHESSCOM_PLAYER}/games/archives"
LICHESS_GAMES = f"https://lichess.org/api/games/user/{LICHESS_PLAYER}"

# Chess.com asks its API's callers to say who they are.
CHESSCOM_HEADERS = {"User-Agent": "ChessMe refresh (github.com/CamilleBochard/ChessMe)"}

# Games in an export follow one another, each opening on its [Event] tag
# after a blank line.
GAME_START = re.compile(r"\n\s*\n(?=\[Event )")


def split_pgn(text: str) -> list[str]:
    """The text of each game of a PGN export, as the site wrote it, in order."""
    games = []
    for game in GAME_START.split(text.strip()):
        if game.strip() != "":
            games.append(game.strip())
    return games


def game_id_of_pgn(game_text: str) -> str:
    """The id the dataset gives the game, read from its headers."""
    headers = chess.pgn.read_headers(io.StringIO(game_text))
    return game_id(headers)


def known_game_ids(raw_dir: Path) -> set[str]:
    """The ids of every game the exports in raw_dir hold, whatever its time control."""
    return set(_known_game_starts(raw_dir))


def _known_game_starts(raw_dir: Path) -> dict[str, tuple[str, datetime]]:
    """Every game the exports in raw_dir hold: its site and when it began, in UTC, by id."""
    known = {}
    for path in sorted(raw_dir.glob("*.pgn")):
        with open(path, encoding="utf-8") as pgn_file:
            while (headers := chess.pgn.read_headers(pgn_file)) is not None:
                began = datetime.strptime(headers["UTCDate"] + " " + headers["UTCTime"], "%Y.%m.%d %H:%M:%S")
                known[game_id(headers)] = (source_of(headers), began.replace(tzinfo=timezone.utc))
    return known


def _latest_start(known: dict[str, tuple[str, datetime]], source: str) -> datetime | None:
    starts = [began for site, began in known.values() if site == source]
    if not starts:
        return None
    return max(starts)


def new_games(pgn_text: str, known_ids: set[str]) -> list[str]:
    """The games of an export that no file holds yet, each once, in the order the site gave them."""
    games = []
    seen = set(known_ids)
    for game in split_pgn(pgn_text):
        identifier = game_id_of_pgn(game)
        if identifier in seen:
            continue
        seen.add(identifier)
        games.append(game)
    return games


LICHESS_TOKEN_VARIABLE = "LICHESS_TOKEN"

MISSING_TOKEN = f"""The Lichess export needs Camille's personal token in the {LICHESS_TOKEN_VARIABLE} environment variable.
Create one with no scope at https://lichess.org/account/oauth/token, then, in the shell that runs the refresh:

    export {LICHESS_TOKEN_VARIABLE}="$(cat ~/.config/chessme/lichess-token)"

The token is only read from the environment, never written anywhere."""


def fetch_new_games(raw_dir: Path, day, get, environ) -> list[Path]:
    """Fetches the games played since the last refresh and writes them to new files dated day.

    get(url, headers) answers a request with the response's text, environ is
    the process environment. Returns the files written, none when no game is
    new.
    """
    token = environ.get(LICHESS_TOKEN_VARIABLE, "").strip()
    # Checked first, so a refresh never writes one site's games and not the other's.
    if token == "":
        raise SystemExit(MISSING_TOKEN)

    known = _known_game_starts(raw_dir)
    known_ids = set(known)

    chesscom_text = _chesscom_games_since(_latest_start(known, "chesscom"), get)
    chesscom_games = new_games(chesscom_text, known_ids)
    lichess_text = _lichess_games_since(_latest_start(known, "lichess"), token, get)
    lichess_games = new_games(lichess_text, known_ids)

    written = []
    for source, games in (("chesscom", chesscom_games), ("lichess", lichess_games)):
        if games:
            written.append(write_games(raw_dir, source, games, day))
    return written


def _chesscom_games_since(latest: datetime | None, get) -> str:
    """Every game of each monthly archive from the month of the latest game held on, as one PGN text."""
    archives = json.loads(get(CHESSCOM_ARCHIVES, CHESSCOM_HEADERS))["archives"]
    texts = []
    for archive in archives:
        year, month = archive.rstrip("/").split("/")[-2:]
        # Earlier months are complete in data/raw already.
        if latest is not None and (int(year), int(month)) < (latest.year, latest.month):
            continue
        texts.append(get(archive + "/pgn", CHESSCOM_HEADERS))
    return "\n\n".join(texts)


def _lichess_games_since(latest: datetime | None, token: str, get) -> str:
    """Camille's Lichess games begun at the latest game held or later, as one PGN text."""
    url = LICHESS_GAMES
    if latest is not None:
        # Lichess counts in milliseconds; the latest game held comes back
        # too and is dropped as already known.
        url += f"?since={int(latest.timestamp() * 1000)}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/x-chess-pgn"}
    return get(url, headers)


def write_games(raw_dir: Path, source: str, games: list[str], day: date) -> Path:
    """Writes games to a new file named after the site and the day; an existing file is never written over."""
    path = raw_dir / f"{source}-{day.isoformat()}.pgn"
    copy = 2
    while path.exists():
        path = raw_dir / f"{source}-{day.isoformat()}-{copy}.pgn"
        copy += 1
    path.write_text("\n\n\n".join(games) + "\n", encoding="utf-8")
    return path


def http_get(url: str, headers: dict[str, str]) -> str:
    """Answers a request to one of the sites with the response's text."""
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read().decode("utf-8")


if __name__ == "__main__":
    import os

    from pipeline.build_dataset import RAW_DIR

    written = fetch_new_games(RAW_DIR, date.today(), http_get, os.environ)
    if not written:
        print("No new game.")
    for path in written:
        print(f"{len(split_pgn(path.read_text(encoding='utf-8')))} new games written to {path}")
