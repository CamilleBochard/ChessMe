"""Finds the Level Break: the last point in Camille's games where his Level changed by more than chance.

The rule is fixed before it is run, and stated in docs/experiments/level-break.md:

- The games are taken in the order they were played. A game's Level is its
  share of mistakes, moves that lost 300 centipawns or more, among
  Camille's moves after ply 10.
- For every split leaving at least MIN_GAMES_PER_SIDE games on each side,
  the difference between the mean Level before and after is computed, and
  the candidate break is the split where it is largest.
- The candidate is a break if that difference is larger than the 99th
  percentile of the same largest difference over SHUFFLES shuffles of the
  game order. Taking the largest over every split in each shuffle too
  accounts for having looked at every split: a history with no change in
  it would show a difference as large one time in a hundred.
- After a break, the rule runs again on the games after it, and the last
  break found is the Level Break.
"""

from collections import defaultdict
from dataclasses import dataclass

import numpy

from pipeline.blunder_profile import MoveLoss

# A move that loses this much is a mistake, the threshold the report and the
# Blunder Profile already use for a costly move.
MISTAKE_CENTIPAWNS = 300

# The plies the Opening Book mostly plays, and where Camille's own opening
# preparation rather than his Level shows.
LAST_OPENING_PLY = 10

# Enough games on each side for the yardsticks built after a break to rest
# on several thousand moves.
MIN_GAMES_PER_SIDE = 150

SHUFFLES = 1000

# The rule runs again whenever new games arrive, and each run is another
# chance of a false alarm: hence 1% rather than 5%.
PERCENTILE = 99

SEED = 13


@dataclass(frozen=True)
class GameLevel:
    """One of Camille's games and its Level: the share of his moves after ply 10 that were mistakes."""

    game_id: str
    played_at: str
    level: float


def game_levels(move_losses: list[MoveLoss], played_at: dict[str, str]) -> list[GameLevel]:
    """Each game's Level, in the order the games were played.

    A game with no move after ply 10 has no Level to read and is left out.
    """
    losses_by_game: dict[str, list[int]] = defaultdict(list)
    for move in move_losses:
        if move.ply > LAST_OPENING_PLY:
            losses_by_game[move.game_id].append(move.centipawn_loss)

    levels = []
    for game_id, losses in losses_by_game.items():
        mistakes = [loss for loss in losses if loss >= MISTAKE_CENTIPAWNS]
        levels.append(GameLevel(game_id=game_id, played_at=played_at[game_id], level=len(mistakes) / len(losses)))
    # Two games begun in the same second keep one order on every run.
    levels.sort(key=lambda game: (game.played_at, game.game_id))
    return levels


@dataclass(frozen=True)
class BreakSearch:
    """What one run of the rule found in a history of games."""

    # The first game the run looked at, and how many it looked at.
    first_game: int
    games: int
    # The first game after the candidate break, counted from the start of
    # the whole history; None when the games looked at are too few to leave
    # MIN_GAMES_PER_SIDE on each side.
    split: int | None
    level_before: float | None
    level_after: float | None
    difference: float | None
    # The difference a history with no change in it exceeds one time in a hundred.
    threshold: float | None
    is_break: bool


@dataclass(frozen=True)
class LevelBreakFinding:
    """Every run of the rule on a history, and the Level Break they found."""

    searches: list[BreakSearch]
    # The first game after the Level Break, and when it was played; None
    # when no break was found.
    level_break: int | None
    level_break_at: str | None


def find_level_break(games: list[GameLevel]) -> LevelBreakFinding:
    """Runs the rule on games, given in the order they were played, then again after each break it finds."""
    searches = [look_for_break(games)]
    while searches[-1].is_break:
        searches.append(look_for_break(games, first_game=searches[-1].split))

    breaks = [search for search in searches if search.is_break]
    if not breaks:
        return LevelBreakFinding(searches=searches, level_break=None, level_break_at=None)
    level_break = breaks[-1].split
    return LevelBreakFinding(searches=searches, level_break=level_break, level_break_at=games[level_break].played_at)


def look_for_break(games: list[GameLevel], first_game: int = 0) -> BreakSearch:
    """Runs the rule once on the games from first_game on, given in the order they were played."""
    levels = numpy.array([game.level for game in games[first_game:]])
    if len(levels) < 2 * MIN_GAMES_PER_SIDE:
        return BreakSearch(first_game, len(levels), None, None, None, None, None, is_break=False)

    differences = _differences_at_every_split(levels)
    best = int(numpy.argmax(differences))
    split = MIN_GAMES_PER_SIDE + best

    generator = numpy.random.default_rng(SEED)
    largest_in_shuffles = []
    for _ in range(SHUFFLES):
        shuffled = generator.permutation(levels)
        largest_in_shuffles.append(float(numpy.max(_differences_at_every_split(shuffled))))
    threshold = _nearest_rank(largest_in_shuffles, PERCENTILE)

    difference = float(differences[best])
    return BreakSearch(
        first_game=first_game,
        games=len(levels),
        split=first_game + split,
        level_before=float(numpy.mean(levels[:split])),
        level_after=float(numpy.mean(levels[split:])),
        difference=difference,
        threshold=threshold,
        is_break=difference > threshold,
    )


def _differences_at_every_split(levels: numpy.ndarray) -> numpy.ndarray:
    """For each split leaving MIN_GAMES_PER_SIDE games on each side, how far apart the two mean Levels are."""
    count = len(levels)
    running_totals = numpy.cumsum(levels)
    total = running_totals[-1]
    splits = numpy.arange(MIN_GAMES_PER_SIDE, count - MIN_GAMES_PER_SIDE + 1)
    # running_totals[split - 1] is the sum of the first split games.
    before = running_totals[splits - 1] / splits
    after = (total - running_totals[splits - 1]) / (count - splits)
    # A Level can fall or rise: either is a change.
    return numpy.abs(before - after)


def _nearest_rank(values: list[float], percentile: int) -> float:
    """The smallest value with at least percentile% of the values at or below it."""
    ordered = sorted(values)
    rank = -(-percentile * len(ordered) // 100)
    return ordered[rank - 1]
