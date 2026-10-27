"""Turns raw PGN exports into the positions the Bot is built and measured on."""

import hashlib
import json
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import chess.pgn

# Chess.com writes a 10-minute game as "600", Lichess as "600+0".
TEN_MINUTE_TIME_CONTROLS = {"600", "600+0"}

# Earlier games show a player several hundred points weaker than Camille is
# now; the Bot imitates the current player.
FIRST_DAY_KEPT = date(2025, 6, 1)


@dataclass(frozen=True)
class Position:
    game_id: str
    source: str
    ply: int
    phase: str
    fen: str
    move: str
    # When the game began, in UTC, as "2025-06-15T10:00:00": the order the
    # Level Break is looked for in. None for games no one dated, such as the
    # Bot's.
    played_at: str | None = None


@dataclass(frozen=True)
class Dataset:
    train: list[Position]
    test: list[Position]


def build_dataset(pgn_paths: list[Path], player: str, test_fraction: float, first_day: date = FIRST_DAY_KEPT) -> Dataset:
    """Filters the games in pgn_paths and splits the player's positions into train and test.

    The split is made per game, so a game's positions all land on the same
    side, and roughly test_fraction of the games are held back as the Test Set.
    An earlier first_day than the dataset's keeps older games too, to look
    at how the player's Level changed before it.
    """
    train = []
    test = []
    for game, game_id in kept_games(pgn_paths, first_day):
        positions = _player_positions(game, game_id, player)
        if is_held_back(game_id, test_fraction):
            test.extend(positions)
        else:
            train.extend(positions)
    return Dataset(train=train, test=test)


def kept_games(pgn_paths: list[Path], first_day: date = FIRST_DAY_KEPT) -> Iterator[tuple[chess.pgn.Game, str]]:
    """The games of pgn_paths the Bot is built from, each with its id.

    Standard chess at ten minutes, played since first_day, each game once:
    new games arrive as further exports, which may overlap the earlier ones.
    """
    seen_game_ids = set()
    for path in pgn_paths:
        with open(path, encoding="utf-8") as pgn_file:
            while (game := chess.pgn.read_game(pgn_file)) is not None:
                if not _is_standard_chess(game):
                    continue
                if not _is_ten_minutes(game):
                    continue
                if _played_on(game) < first_day:
                    continue
                kept_id = game_id(game.headers)
                if kept_id in seen_game_ids:
                    continue
                seen_game_ids.add(kept_id)
                yield game, kept_id


def played_since(positions: list[Position], since: str | None) -> list[Position]:
    """The positions of the games that began at the moment since or later; every position when since is None.

    since is written as played_at is, such as "2025-06-15T10:00:00", so the
    two compare as text.
    """
    if since is None:
        return positions
    return [position for position in positions if position.played_at >= since]


def read_dataset(dataset_dir: Path) -> Dataset:
    """Reads back the train.jsonl and test.jsonl files the dataset build wrote to dataset_dir."""
    return Dataset(
        train=_read_json_lines(dataset_dir / "train.jsonl"),
        test=_read_json_lines(dataset_dir / "test.jsonl"),
    )


def _read_json_lines(path: Path) -> list[Position]:
    positions = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() == "":
            continue
        positions.append(Position(**json.loads(line)))
    return positions


def is_held_back(game_id: str, test_fraction: float) -> bool:
    """Whether a game belongs to the Test Set.

    The decision depends on the game's id alone, through a hash, so it is the
    same on every run and a game keeps its side when new games are added.
    """
    digest = hashlib.sha256(game_id.encode("utf-8")).digest()
    # The first 8 bytes read as a number spread evenly over [0, 1).
    hash_as_fraction = int.from_bytes(digest[:8], "big") / 2**64
    return hash_as_fraction < test_fraction


def _is_standard_chess(game: chess.pgn.Game) -> bool:
    # Chess.com leaves the header out of standard games; Lichess writes "Standard".
    variant = game.headers.get("Variant", "Standard")
    return variant == "Standard"


def _is_ten_minutes(game: chess.pgn.Game) -> bool:
    return game.headers.get("TimeControl") in TEN_MINUTE_TIME_CONTROLS


# Every Phase, in the order a game passes through them.
PHASES = ["opening", "middlegame", "endgame"]

# How a Phase is named in a table, with the plies phase_of assigns to it.
PHASE_LABELS = {"opening": "Opening (1-10)", "middlegame": "Middlegame (11-30)", "endgame": "Endgame (31+)"}


def phase_of(ply: int) -> str:
    """The Phase a move belongs to, by its ply: opening 1-10, middlegame 11-30, endgame 31+."""
    if ply <= 10:
        return "opening"
    if ply <= 30:
        return "middlegame"
    return "endgame"


def _played_on(game: chess.pgn.Game) -> date:
    # UTCDate rather than Date, so both sites agree on which day a game near
    # midnight belongs to.
    return datetime.strptime(game.headers["UTCDate"], "%Y.%m.%d").date()


def _played_at(game: chess.pgn.Game) -> str:
    """When the game began, in UTC, from the date and time both sites write."""
    began = datetime.strptime(game.headers["UTCDate"] + " " + game.headers["UTCTime"], "%Y.%m.%d %H:%M:%S")
    return began.isoformat()


def _player_positions(game: chess.pgn.Game, game_id: str, player: str) -> list[Position]:
    player_colour = _player_colour(game, player, game_id)
    source = source_of(game.headers)
    moves = list(game.mainline_moves())
    return positions_faced(game_id, source, moves, player_colour, played_at=_played_at(game))


def positions_faced(
    game_id: str, source: str, moves: list[chess.Move], colour: chess.Color, played_at: str | None = None
) -> list[Position]:
    """The positions the side playing colour faced in a game from the starting position, each with its move.

    Camille's games and the Bot's games both go through here, so a position
    is recorded, and its Phase assigned, the same way for either player.
    """
    positions = []
    board = chess.Board()
    for move in moves:
        # The ply of the move about to be played: White's first move is ply 1.
        ply = board.ply() + 1
        if board.turn == colour:
            position = Position(
                game_id=game_id,
                source=source,
                ply=ply,
                phase=phase_of(ply),
                fen=board.fen(),
                move=move.uci(),
                played_at=played_at,
            )
            positions.append(position)
        board.push(move)
    return positions


def player_rating(game: chess.pgn.Game, player: str) -> int | None:
    """The player's rating on the game's site when it began; None when the site did not write one.

    Each site rates on its own scale, so ratings compare only within a site.
    """
    if game.headers["White"].lower() == player.lower():
        rating = game.headers.get("WhiteElo")
    else:
        rating = game.headers.get("BlackElo")
    if rating is None or not rating.isdigit():
        return None
    return int(rating)


def _player_colour(game: chess.pgn.Game, player: str, game_id: str) -> chess.Color:
    if game.headers["White"].lower() == player.lower():
        return chess.WHITE
    if game.headers["Black"].lower() == player.lower():
        return chess.BLACK
    # Recording the opponent's moves as the player's would corrupt every
    # measurement silently, so a game that is not the player's stops the build.
    raise ValueError(f"{player} played neither side of {game_id}")


def game_id(headers: chess.pgn.Headers) -> str:
    """Names a game uniquely across both sites, as "<source>:<site's own id>", from its PGN headers."""
    source = source_of(headers)
    if source == "lichess":
        return "lichess:" + headers["GameId"]
    # Chess.com gives no id header; the game's URL ends with it.
    link = headers["Link"]
    return "chesscom:" + link.rsplit("/", 1)[-1]


def source_of(headers: chess.pgn.Headers) -> str:
    """The site a game was played on, "chesscom" or "lichess", from its PGN headers."""
    site = headers["Site"]
    if site == "Chess.com":
        return "chesscom"
    if "lichess.org" in site:
        return "lichess"
    raise ValueError(f"Game from an unknown site: {site!r}")
