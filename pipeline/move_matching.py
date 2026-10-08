"""Move-Matching scored in Python, the same way the engine's evaluation harness scores it.

The Move-Selection Engine is measured under Node (src/evaluation/move-matching.ts).
The fine-tuning experiment runs its models in PyTorch instead, so its scores are
computed here with the same slices and the same standard error, and can be set
beside the Baseline the engine measured.
"""

from dataclasses import dataclass

from pipeline.dataset import Position

PHASES = ["opening", "middlegame", "endgame"]

# Published Maia figures leave out each game's first ten plies, where the
# opening makes moves easy to predict.
LAST_OPENING_PLY = 10


@dataclass(frozen=True)
class MoveMatchingScore:
    matched: int
    positions: int
    games: int
    # The standard error of the share matched, as a fraction like the share
    # itself, with games as clusters: positions from one game share an opening,
    # a plan and an opponent, so they are not independent samples. NaN when the
    # positions come from a single game.
    standard_error: float


@dataclass(frozen=True)
class MoveMatchingReport:
    overall: MoveMatchingScore
    after_ply_10: MoveMatchingScore
    by_phase: dict[str, MoveMatchingScore]


@dataclass
class _GameTally:
    matched: int = 0
    positions: int = 0


def move_matching_report(positions: list[Position], model_moves: list[str]) -> MoveMatchingReport:
    """Scores the move a model played in each position against the move Camille played.

    model_moves[i] is the model's move, in UCI form, for positions[i].
    """
    outcomes = []
    for played_position, model_move in zip(positions, model_moves, strict=True):
        is_match = model_move == played_position.move
        outcomes.append((played_position, is_match))

    after_opening = [outcome for outcome in outcomes if outcome[0].ply > LAST_OPENING_PLY]
    by_phase = {}
    for phase in PHASES:
        in_phase = [outcome for outcome in outcomes if outcome[0].phase == phase]
        by_phase[phase] = _score(in_phase)

    return MoveMatchingReport(overall=_score(outcomes), after_ply_10=_score(after_opening), by_phase=by_phase)


def _score(outcomes: list[tuple[Position, bool]]) -> MoveMatchingScore:
    tallies: dict[str, _GameTally] = {}
    for played_position, is_match in outcomes:
        tally = tallies.setdefault(played_position.game_id, _GameTally())
        tally.positions = tally.positions + 1
        if is_match:
            tally.matched = tally.matched + 1

    matched = sum(tally.matched for tally in tallies.values())
    positions = sum(tally.positions for tally in tallies.values())
    game_tallies = list(tallies.values())
    return MoveMatchingScore(
        matched=matched,
        positions=positions,
        games=len(game_tallies),
        standard_error=_clustered_standard_error(game_tallies, matched, positions),
    )


def _clustered_standard_error(games: list[_GameTally], matched: int, positions: int) -> float:
    """The cluster-robust standard error of a share, with games as clusters.

    Each game contributes how far its matches stray from what the overall share
    predicts for its number of positions; the spread of those residuals across
    games, scaled by G / (G - 1) to correct for estimating the share from the
    same games, gives the variance.
    """
    game_count = len(games)
    if game_count < 2:
        return float("nan")

    share = matched / positions
    sum_of_squared_residuals = 0.0
    for game in games:
        residual = game.matched - share * game.positions
        sum_of_squared_residuals = sum_of_squared_residuals + residual * residual

    small_sample_correction = game_count / (game_count - 1)
    variance = small_sample_correction * sum_of_squared_residuals / (positions * positions)
    return variance**0.5
