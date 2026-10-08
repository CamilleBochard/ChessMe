"""Move-Matching scored in Python, the same way the engine's evaluation harness scores it.

The Move-Selection Engine is measured under Node (src/evaluation/move-matching.ts).
The fine-tuning experiment runs its models in PyTorch instead, so its scores are
computed here with the same slices and the same standard error, and can be set
beside the Baseline the engine measured.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from pipeline.dataset import PHASES, Position

# Published Maia figures leave out each game's first ten plies, where the
# opening makes moves easy to predict.
LAST_OPENING_PLY = 10

# How many standard errors a gain must exceed before it counts as real: about
# a 2.5% chance of a model with no real gain clearing it by luck.
STANDARD_ERRORS_REQUIRED = 2


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


@dataclass(frozen=True)
class Gain:
    # The model's share matched minus the Baseline's, as a fraction: 0.01 is
    # one percentage point more of Camille's moves.
    gain: float
    # The standard error of that gain, with games as clusters. Both models
    # play the same positions, so the error is computed from each game's own
    # gain rather than from the two separate errors, which would overstate it.
    # NaN for a single game.
    standard_error: float


@dataclass(frozen=True)
class BaselineComparison:
    overall: Gain
    after_ply_10: Gain
    by_phase: dict[str, Gain]


@dataclass(frozen=True)
class _Outcome:
    position: Position
    # 1 or 0 for a match or a miss when scoring a model; +1, 0 or -1 when
    # comparing one with the Baseline.
    value: int


@dataclass
class _GameTally:
    # The sum of the game's outcome values: its matches, or its net gain.
    total: int = 0
    positions: int = 0


Summary = TypeVar("Summary")


def move_matching_report(positions: list[Position], model_moves: list[str]) -> MoveMatchingReport:
    """Scores the move a model played in each position against the move Camille played.

    model_moves[i] is the model's move, in UCI form, for positions[i].
    """
    outcomes = []
    for played_position, model_move in zip(positions, model_moves, strict=True):
        if model_move == played_position.move:
            outcomes.append(_Outcome(played_position, 1))
        else:
            outcomes.append(_Outcome(played_position, 0))

    overall, after_ply_10, by_phase = _summarise_each_slice(outcomes, _score)
    return MoveMatchingReport(overall=overall, after_ply_10=after_ply_10, by_phase=by_phase)


def compare_with_baseline(
    positions: list[Position], baseline_moves: list[str], model_moves: list[str]
) -> BaselineComparison:
    """How much more often a model plays Camille's move than the Baseline does, on the same positions."""
    outcomes = []
    for played_position, baseline_move, model_move in zip(positions, baseline_moves, model_moves, strict=True):
        model_matches = model_move == played_position.move
        baseline_matches = baseline_move == played_position.move
        if model_matches and not baseline_matches:
            outcomes.append(_Outcome(played_position, 1))
        elif baseline_matches and not model_matches:
            outcomes.append(_Outcome(played_position, -1))
        else:
            outcomes.append(_Outcome(played_position, 0))

    overall, after_ply_10, by_phase = _summarise_each_slice(outcomes, _gain)
    return BaselineComparison(overall=overall, after_ply_10=after_ply_10, by_phase=by_phase)


def beats_baseline(comparison: BaselineComparison) -> bool:
    """Whether a model plays Camille's move more often than the Baseline by more than chance would.

    Judged after ply 10, as the Base Model was chosen: the Opening Book answers
    most opening positions, so a gain there would rarely reach a visitor.
    """
    after_ply_10 = comparison.after_ply_10
    return after_ply_10.gain > STANDARD_ERRORS_REQUIRED * after_ply_10.standard_error


def _summarise_each_slice(
    outcomes: list[_Outcome], summarise: Callable[[list[_Outcome]], Summary]
) -> tuple[Summary, Summary, dict[str, Summary]]:
    """Summarises every position, the positions after ply 10, and each Phase's positions."""
    after_opening = [outcome for outcome in outcomes if outcome.position.ply > LAST_OPENING_PLY]
    by_phase = {}
    for phase in PHASES:
        in_phase = [outcome for outcome in outcomes if outcome.position.phase == phase]
        by_phase[phase] = summarise(in_phase)
    return summarise(outcomes), summarise(after_opening), by_phase


def _score(outcomes: list[_Outcome]) -> MoveMatchingScore:
    tallies = _tally_by_game(outcomes)
    matched = sum(tally.total for tally in tallies)
    positions = sum(tally.positions for tally in tallies)
    return MoveMatchingScore(
        matched=matched,
        positions=positions,
        games=len(tallies),
        standard_error=_clustered_standard_error(tallies),
    )


def _gain(outcomes: list[_Outcome]) -> Gain:
    """The mean gain per position, with the same clustered error as a share.

    Each game's net gain plays the part a game's matches play in a share, so
    the cluster-robust formula carries over unchanged.
    """
    tallies = _tally_by_game(outcomes)
    net_gain = sum(tally.total for tally in tallies)
    positions = sum(tally.positions for tally in tallies)
    if positions == 0:
        return Gain(gain=float("nan"), standard_error=float("nan"))
    return Gain(gain=net_gain / positions, standard_error=_clustered_standard_error(tallies))


def _tally_by_game(outcomes: list[_Outcome]) -> list[_GameTally]:
    tallies: dict[str, _GameTally] = {}
    for outcome in outcomes:
        tally = tallies.setdefault(outcome.position.game_id, _GameTally())
        tally.positions = tally.positions + 1
        tally.total = tally.total + outcome.value
    return list(tallies.values())


def _clustered_standard_error(games: list[_GameTally]) -> float:
    """The cluster-robust standard error of a mean per position, with games as clusters.

    Each game contributes how far its total strays from what the overall mean
    predicts for its number of positions; the spread of those residuals across
    games, scaled by G / (G - 1) to correct for estimating the mean from the
    same games, gives the variance.
    """
    game_count = len(games)
    if game_count < 2:
        return float("nan")

    total = sum(game.total for game in games)
    positions = sum(game.positions for game in games)
    mean = total / positions
    sum_of_squared_residuals = 0.0
    for game in games:
        residual = game.total - mean * game.positions
        sum_of_squared_residuals = sum_of_squared_residuals + residual * residual

    small_sample_correction = game_count / (game_count - 1)
    variance = small_sample_correction * sum_of_squared_residuals / (positions * positions)
    return variance**0.5
