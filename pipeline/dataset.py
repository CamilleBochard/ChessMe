"""Turns raw PGN exports into the positions the Bot is built and measured on."""

from dataclasses import dataclass
from pathlib import Path

import chess.pgn


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
                positions.extend(_player_positions(game, player))
    return Dataset(train=positions, test=[])


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
