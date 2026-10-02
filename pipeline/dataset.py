"""Turns raw PGN exports into the positions the Bot is built and measured on."""

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
    move: str


@dataclass(frozen=True)
class Dataset:
    train: list[Position]
    test: list[Position]


def build_dataset(pgn_paths: list[Path], player: str, test_fraction: float) -> Dataset:
    positions = []
    for path in pgn_paths:
        with open(path, encoding="utf-8") as pgn_file:
            while (game := chess.pgn.read_game(pgn_file)) is not None:
                if not _is_ten_minutes(game):
                    continue
                if _played_on(game) < FIRST_DAY_KEPT:
                    continue
                positions.extend(_player_positions(game, player))
    return Dataset(train=positions, test=[])


def _is_ten_minutes(game: chess.pgn.Game) -> bool:
    return game.headers.get("TimeControl") in TEN_MINUTE_TIME_CONTROLS


def _played_on(game: chess.pgn.Game) -> date:
    # UTCDate rather than Date, so both sites agree on which day a game near
    # midnight belongs to.
    return datetime.strptime(game.headers["UTCDate"], "%Y.%m.%d").date()


def _player_positions(game: chess.pgn.Game, player: str) -> list[Position]:
    player_is_white = game.headers["White"].lower() == player.lower()
    player_colour = chess.WHITE if player_is_white else chess.BLACK
    game_id = _game_id(game)

    positions = []
    board = game.board()
    for move in game.mainline_moves():
        if board.turn == player_colour:
            positions.append(Position(game_id=game_id, move=move.uci()))
        board.push(move)
    return positions


def _game_id(game: chess.pgn.Game) -> str:
    link = game.headers["Link"]
    return "chesscom:" + link.rsplit("/", 1)[-1]
