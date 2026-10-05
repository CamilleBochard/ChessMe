"""Reads the games the Bot played under Node into the positions it faced.

scripts/bot-games.ts plays the games and writes one JSON object per line:
the game's id, the colour the Bot played and every move of the game in UCI
form. The positions come out in the dataset's own shape, so whatever is
measured on Camille's positions can be measured on the Bot's by the same code.
"""

import json
from pathlib import Path

import chess

from pipeline.dataset import Position, positions_faced

BOT_SOURCE = "bot"

COLOURS = {"white": chess.WHITE, "black": chess.BLACK}


def read_bot_games(path: Path) -> list[Position]:
    positions = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() == "":
            continue
        game = json.loads(line)
        moves = [chess.Move.from_uci(move) for move in game["moves"]]
        bot_colour = COLOURS[game["bot_colour"]]
        positions.extend(positions_faced(game["game_id"], BOT_SOURCE, moves, bot_colour))
    return positions
