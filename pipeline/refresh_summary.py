"""What a refresh of Camille's games changed: the figures its summary reports.

Each function compares what was built before the refresh with what it built,
so the report of each run says what moved and by how much.
"""

from pipeline.dataset import PHASES, Position


def new_games_summary(before: list[Position], after: list[Position]) -> dict:
    """How many games the dataset gained, and how many of Camille's moves each Phase gained with them."""
    known_games = {position.game_id for position in before}
    new_positions = [position for position in after if position.game_id not in known_games]
    moves = {}
    for phase in PHASES:
        moves[phase] = len([position for position in new_positions if position.phase == phase])
    return {"games": len({position.game_id for position in new_positions}), "moves": moves}


def book_changes(before: dict[str, str], after: dict[str, str]) -> dict:
    """How the Opening Book's positions changed: added, dropped, or answered with another move than before."""
    added = [position for position in after if position not in before]
    dropped = [position for position in before if position not in after]
    changed = [position for position in after if position in before and after[position] != before[position]]
    return {
        "positions_before": len(before),
        "positions_after": len(after),
        "added": len(added),
        "dropped": len(dropped),
        "changed": len(changed),
    }


# The improbability profile counts moves on a ladder of 51 probabilities from
# 10^-5 to 1, a tenth of a power of ten apart; 1% is the 31st rung.
ONE_PERCENT_RUNG = 30


def profile_movement(before: dict[str, dict | None], after: dict[str, dict | None]) -> dict:
    """Each profile's headline figures per Phase, before the refresh and after it.

    The profiles are named as the refresh names them: "blunder_profile",
    "improbability" and "loss". A profile built for the first time has
    nothing before.
    """
    moved = {}
    for name, after_profile in after.items():
        figures_after = _figures(name, after_profile)
        figures_before = _figures(name, before.get(name))
        moved[name] = {}
        for figure, value in figures_after.items():
            moved[name][figure] = {"before": figures_before.get(figure), "after": value}
    return moved


def _figures(name: str, profile: dict | None) -> dict:
    if profile is None:
        return {}
    figures = {}
    for phase in PHASES:
        if name == "blunder_profile":
            figures[f"{phase} mean loss, open positions"] = profile["open_positions"]["phases"][phase]["mean"]
            continue
        in_phase = profile["phases"][phase]
        if name == "improbability":
            figures[f"{phase} share at or below 1%"] = in_phase["atOrBelow"][ONE_PERCENT_RUNG]
        spread = in_phase["perGame"]
        low = None
        high = None
        if spread is not None:
            low = spread["low"]
            high = spread["high"]
        figures[f"{phase} middle 80% of games, low"] = low
        figures[f"{phase} middle 80% of games, high"] = high
    return figures
