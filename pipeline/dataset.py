"""Turns raw PGN exports into the positions the Bot is built and measured on."""

import hashlib
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


@dataclass(frozen=True)
class Dataset:
    train: list[Position]
    test: list[Position]


def build_dataset(pgn_paths: list[Path], player: str, test_fraction: float) -> Dataset:
    """Filters the games in pgn_paths and splits the player's positions into train and test.

    The split is made per game, so a game's positions all land on the same
    side, and roughly test_fraction of the games are held back as the Test Set.
    """
    train = []
    test = []
    # New games arrive as further exports, which may overlap the earlier ones.
    seen_game_ids = set()
    for path in pgn_paths:
        with open(path, encoding="utf-8") as pgn_file:
            while (game := chess.pgn.read_game(pgn_file)) is not None:
                if not _is_standard_chess(game):
                    continue
                if not _is_ten_minutes(game):
                    continue
                if _played_on(game) < FIRST_DAY_KEPT:
                    continue
                game_id = _game_id(game)
                if game_id in seen_game_ids:
                    continue
                seen_game_ids.add(game_id)

                positions = _player_positions(game, game_id, player)
                if _is_held_back(game_id, test_fraction):
                    test.extend(positions)
                else:
                    train.extend(positions)
    return Dataset(train=train, test=test)


def _is_held_back(game_id: str, test_fraction: float) -> bool:
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


def _phase_of(ply: int) -> str:
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


def _player_positions(game: chess.pgn.Game, game_id: str, player: str) -> list[Position]:
    player_colour = _player_colour(game, player, game_id)
    source = _source(game)

    positions = []
    board = game.board()
    for move in game.mainline_moves():
        # The ply of the move about to be played: White's first move is ply 1.
        ply = board.ply() + 1
        if board.turn == player_colour:
            position = Position(
                game_id=game_id,
                source=source,
                ply=ply,
                phase=_phase_of(ply),
                fen=board.fen(),
                move=move.uci(),
            )
            positions.append(position)
        board.push(move)
    return positions


def _player_colour(game: chess.pgn.Game, player: str, game_id: str) -> chess.Color:
    if game.headers["White"].lower() == player.lower():
        return chess.WHITE
    if game.headers["Black"].lower() == player.lower():
        return chess.BLACK
    # Recording the opponent's moves as the player's would corrupt every
    # measurement silently, so a game that is not the player's stops the build.
    raise ValueError(f"{player} played neither side of {game_id}")


def _game_id(game: chess.pgn.Game) -> str:
    """Names a game uniquely across both sites, as "<source>:<site's own id>"."""
    source = _source(game)
    if source == "lichess":
        return "lichess:" + game.headers["GameId"]
    # Chess.com gives no id header; the game's URL ends with it.
    link = game.headers["Link"]
    return "chesscom:" + link.rsplit("/", 1)[-1]


def _source(game: chess.pgn.Game) -> str:
    site = game.headers["Site"]
    if site == "Chess.com":
        return "chesscom"
    if "lichess.org" in site:
        return "lichess"
    raise ValueError(f"Game from an unknown site: {site!r}")
