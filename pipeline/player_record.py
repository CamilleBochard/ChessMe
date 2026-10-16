"""Camille's record over the games the Bot is built from: how many he played
with each colour, how they went, and the openings he plays most.

The page shows it as it is; every figure is worked out here.
"""

import io

import chess
import chess.pgn

# How many openings the record lists with each colour.
OPENINGS_LISTED = 5

# The result a PGN writes for a win of each side, and for a draw.
WINNING_RESULT = {chess.WHITE: "1-0", chess.BLACK: "0-1"}
DRAW_RESULT = "1/2-1/2"


def player_record(games: list[chess.pgn.Game], player: str, table: dict[str, str]) -> dict:
    """The record of player over games, as the page reads it, with openings named from table."""
    white_games = [game for game in games if game.headers["White"].lower() == player.lower()]
    black_games = [game for game in games if game.headers["Black"].lower() == player.lower()]
    white = _colour_record(white_games, chess.WHITE, table)
    black = _colour_record(black_games, chess.BLACK, table)
    results = {}
    for outcome in white["results"]:
        results[outcome] = white["results"][outcome] + black["results"][outcome]
    return {"games": len(games), "results": results, "white": white, "black": black}


def _colour_record(games: list[chess.pgn.Game], colour: chess.Color, table: dict[str, str]) -> dict:
    """What the player's games with one colour add up to."""
    return {
        "games": len(games),
        "results": _results(games, colour),
        "openings": _openings(games, colour, table),
    }


def _openings(games: list[chess.pgn.Game], colour: chess.Color, table: dict[str, str]) -> list[dict]:
    """The opening families played most in games, most played first, each with the player's results in it.

    A family is the name before the colon: Sicilian Defense for every
    variation of it, as a player speaks of their repertoire. A game that
    reaches no line of the table counts under none.
    """
    games_by_family: dict[str, list[chess.pgn.Game]] = {}
    for game in games:
        name = opening_of(game, table)
        if name is None:
            continue
        family = name.split(":")[0]
        games_by_family.setdefault(family, []).append(game)

    openings = []
    for family, family_games in games_by_family.items():
        openings.append({"name": family, "games": len(family_games), "results": _results(family_games, colour)})
    # Python's sort is stable: openings played as often stay in the order first met.
    openings.sort(key=lambda opening: opening["games"], reverse=True)
    return openings[:OPENINGS_LISTED]


def _results(games: list[chess.pgn.Game], colour: chess.Color) -> dict:
    """The player's wins, draws and losses in games they played with colour."""
    results = {"wins": 0, "draws": 0, "losses": 0}
    for game in games:
        result = game.headers["Result"]
        if result == WINNING_RESULT[colour]:
            results["wins"] += 1
        elif result == DRAW_RESULT:
            results["draws"] += 1
        else:
            results["losses"] += 1
    return results


def opening_table(lines: list[tuple[str, str]]) -> dict[str, str]:
    """The openings table, from (name, moves) lines, keyed by the position each line ends on.

    Keyed by position rather than by moves, so a game that reaches a line in
    another order is still named after it. The position is an EPD: the
    board, the side to move, castling and en passant, without the move
    counters, which differ between move orders.
    """
    table = {}
    for name, moves in lines:
        line = chess.pgn.read_game(io.StringIO(moves))
        board = line.end().board()
        table[board.epd()] = name
    return table


def opening_of(game: chess.pgn.Game, table: dict[str, str]) -> str | None:
    """The name of the deepest line of the table the game reaches, or None if it reaches none."""
    name = None
    board = game.board()
    for move in game.mainline_moves():
        board.push(move)
        reached = table.get(board.epd())
        if reached is not None:
            name = reached
    return name
