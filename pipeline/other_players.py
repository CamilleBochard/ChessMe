"""Samples games of other players at Camille's level from the Lichess database.

The style discriminator learns to tell Camille's games from those of other
players of his strength. Lichess publishes every rated game of a month as one
PGN file; this module reads such a stream and keeps one side of the games
that match: a 10-minute game, played by someone rated where Camille is.

Each kept game is written in the shape the Bot's games are stored in: its id,
whose side was kept, and every move in UCI form, so the same code turns both
into the positions a player faced.
"""

import hashlib
import json
from pathlib import Path
from typing import TextIO

import chess
import chess.pgn

from pipeline.dataset import TEN_MINUTE_TIME_CONTROLS, Position, positions_faced

COLOUR_NAMES = {chess.WHITE: "white", chess.BLACK: "black"}
COLOURS = {"white": chess.WHITE, "black": chess.BLACK}

SOURCE = "lichess"


def sample_other_players(
    pgn_stream: TextIO,
    rating_range: tuple[int, int],
    excluded_player: str,
    games_wanted: int,
) -> list[dict]:
    lowest_rating, highest_rating = rating_range
    sampled = []
    # Lichess names are case-insensitive, so they are compared in lower case.
    players_sampled = set()
    # The database is read as a stream and never to its end: one month holds
    # far more games than the sample needs.
    while len(sampled) < games_wanted:
        game = chess.pgn.read_game(pgn_stream, Visitor=_TenMinuteGameBuilder)
        if game is None:
            break
        # The time control Camille's games are filtered to: a player's
        # choices at 10 minutes are not his choices at 3.
        if game.headers.get("TimeControl") not in TEN_MINUTE_TIME_CONTROLS:
            continue
        qualifying_colours = []
        for colour in [chess.WHITE, chess.BLACK]:
            rating = _rating(game, colour)
            if rating < lowest_rating or rating > highest_rating:
                continue
            # One game per player, so that the sample is many players
            # rather than a few prolific ones.
            player = game.headers[_side_header(colour)].lower()
            if player in players_sampled:
                continue
            if player == excluded_player.lower():
                continue
            qualifying_colours.append(colour)
        if not qualifying_colours:
            continue

        colour = _one_side(game, qualifying_colours)
        players_sampled.add(game.headers[_side_header(colour)].lower())
        sampled.append(
            {
                "game_id": _game_id(game),
                "player": game.headers[_side_header(colour)],
                "colour": COLOUR_NAMES[colour],
                "rating": _rating(game, colour),
                "moves": [move.uci() for move in game.mainline_moves()],
            }
        )
    return sampled


class _TenMinuteGameBuilder(chess.pgn.GameBuilder):
    """Reads a game's moves only when it is a 10-minute game.

    Nine games in ten of the database are at other time controls; reading
    only their headers makes sampling several times faster.
    """

    def end_headers(self):
        if self.game.headers.get("TimeControl") not in TEN_MINUTE_TIME_CONTROLS:
            return chess.pgn.SKIP
        return None


def read_other_players(path: Path) -> list[Position]:
    """The positions each sampled player faced, read from the JSON lines sample_other_players' games were written as."""
    positions = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() == "":
            continue
        game = json.loads(line)
        moves = [chess.Move.from_uci(move) for move in game["moves"]]
        colour = COLOURS[game["colour"]]
        positions.extend(positions_faced(game["game_id"], SOURCE, moves, colour))
    return positions


def _one_side(game: chess.pgn.Game, qualifying_colours: list[chess.Color]) -> chess.Color:
    """One side of a game, so that two players of the same game never both enter the sample.

    When both sides qualify, the game's id decides, through a hash, which is
    kept: always keeping White would fill the sample with White's games,
    where Camille's games are split between the colours.
    """
    if len(qualifying_colours) == 1:
        return qualifying_colours[0]
    digest = hashlib.sha256(_game_id(game).encode("utf-8")).digest()
    if digest[0] % 2 == 0:
        return chess.WHITE
    return chess.BLACK


def _side_header(colour: chess.Color) -> str:
    """The header naming the player of a colour: "White" or "Black"."""
    return COLOUR_NAMES[colour].capitalize()


def _rating(game: chess.pgn.Game, colour: chess.Color) -> int:
    return int(game.headers[_side_header(colour) + "Elo"])


def _game_id(game: chess.pgn.Game) -> str:
    """Names a game as the dataset does, "lichess:<id>"; the database gives the id only in the game's URL."""
    link = game.headers["Site"]
    return "lichess:" + link.rsplit("/", 1)[-1]
