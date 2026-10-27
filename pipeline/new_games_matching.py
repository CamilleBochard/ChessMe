"""Move-Matching of the served model on the games a refresh brings, measured before anything is trained on them.

The Test Set is the same 230 games every time. The games each refresh brings
are new to the served model, so measured before it trains on them they are
a fresh out-of-sample test. The untrained Maia-3 5M answers the same
positions: some months' positions are easier to guess than others, and the
untrained model is the yardstick that separates that from what Camille's
games taught the served one. The figure followed from month to month is the
gain, served minus untrained.

Each game's moves and matches are kept per Phase, so that months too short to
be reported alone can be pooled and their errors computed again over the
union of their games.
"""

import math

from pipeline.dataset import PHASES, Position
from pipeline.move_matching import GameTally, clustered_standard_error


def game_tallies(positions: list[Position], served_matches: list[bool], untrained_matches: list[bool]) -> list[dict]:
    """Per game and per Phase: Camille's moves, and how many of them each model's first choice matched.

    served_matches[i] says whether the served model's most likely move in
    positions[i] is the move Camille played, untrained_matches[i] the same for
    the untrained model.
    """
    games: dict[str, dict] = {}
    for played_position, served_matched, untrained_matched in zip(positions, served_matches, untrained_matches, strict=True):
        game = games.get(played_position.game_id)
        if game is None:
            by_phase = {}
            for phase in PHASES:
                by_phase[phase] = {"moves": 0, "served": 0, "untrained": 0}
            game = {"game_id": played_position.game_id, "played_at": played_position.played_at, "by_phase": by_phase}
            games[played_position.game_id] = game

        tally = game["by_phase"][played_position.phase]
        tally["moves"] = tally["moves"] + 1
        if served_matched:
            tally["served"] = tally["served"] + 1
        if untrained_matched:
            tally["untrained"] = tally["untrained"] + 1
    return list(games.values())


def figures(games: list[dict]) -> dict:
    """Each model's Move-Matching and the gain between them, over every move ("all") and per Phase.

    Shares are fractions, like their standard errors, which are clustered by
    game: a game's moves share an opening, a plan and an opponent, so they
    are not independent samples. The gain's error is computed from each
    game's own gain, both models having answered the same positions, so
    whatever makes one game easier to guess than another cancels out of it.
    """
    slices = {"all": [_whole_game(game) for game in games]}
    for phase in PHASES:
        slices[phase] = [game["by_phase"][phase] for game in games]

    result = {}
    for name, tallies in slices.items():
        result[name] = _slice_figures(tallies)
    return result


def _whole_game(game: dict) -> dict:
    whole = {"moves": 0, "served": 0, "untrained": 0}
    for tally in game["by_phase"].values():
        for count in whole:
            whole[count] = whole[count] + tally[count]
    return whole


def _slice_figures(tallies: list[dict]) -> dict:
    # A game with no move in the slice, such as a short game in the endgame,
    # is not one of the slice's clusters.
    played = [tally for tally in tallies if tally["moves"] > 0]

    served = []
    untrained = []
    gain = []
    for tally in played:
        served.append(GameTally(total=tally["served"], positions=tally["moves"]))
        untrained.append(GameTally(total=tally["untrained"], positions=tally["moves"]))
        gain.append(GameTally(total=tally["served"] - tally["untrained"], positions=tally["moves"]))

    return {
        "games": len(played),
        "moves": sum(tally["moves"] for tally in played),
        "served": _mean_with_error(served),
        "untrained": _mean_with_error(untrained),
        "gain": _mean_with_error(gain),
    }


def _mean_with_error(games: list[GameTally]) -> dict:
    moves = sum(game.positions for game in games)
    if moves == 0:
        return {"share": None, "standard_error": None}
    total = sum(game.total for game in games)
    standard_error = clustered_standard_error(games)
    # One game's spread cannot be measured. The figures are written as JSON,
    # which holds null but not NaN.
    if math.isnan(standard_error):
        standard_error = None
    return {"share": total / moves, "standard_error": standard_error}
