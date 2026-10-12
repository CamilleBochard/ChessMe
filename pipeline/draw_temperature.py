"""Chooses the temperature the Bot draws the Base Model's move at, by how close
its evaluation losses come to Camille's Blunder Profile.

The Blunder Profile is the yardstick, never a mechanism: the Bot's moves are
only measured, never filtered or corrected by their evaluation.
"""

from bisect import bisect_right
from dataclasses import dataclass

from pipeline.blunder_profile import MoveLoss
from pipeline.dataset import PHASES


def loss_distance(bot: list[MoveLoss], camille: list[MoveLoss]) -> float:
    """How far the Bot's evaluation losses are from Camille's, in centipawns.

    Each Phase is compared on its own, by how far each loss would have to
    move on average to turn the Bot's distribution into his, and the Phases
    are weighed by his share of moves in each: the distance for a move picked
    at random from his games. Comparing all moves at once would instead
    measure how long each player's games last, since the Bot's run on to
    mate where his often end in a resignation.
    """
    distance = 0.0
    for phase in PHASES:
        bot_losses = _losses_in(bot, phase)
        camille_losses = _losses_in(camille, phase)
        if not camille_losses:
            continue
        camille_share = len(camille_losses) / len(camille)
        distance += camille_share * _area_between_cumulative_distributions(bot_losses, camille_losses)
    return distance


def _losses_in(moves: list[MoveLoss], phase: str) -> list[int]:
    return [move.centipawn_loss for move in moves if move.phase == phase]


def _area_between_cumulative_distributions(first: list[int], second: list[int]) -> float:
    """How far, on average, each loss has to move to turn one distribution into the other.

    It is the area between the two cumulative distributions, the share of
    moves losing at most x drawn against x, also known as the earth mover's
    distance. Between two consecutive losses that occur in either list both
    shares stay flat, so the area is a sum of rectangles.
    """
    first_sorted = sorted(first)
    second_sorted = sorted(second)
    every_loss = sorted(set(first_sorted) | set(second_sorted))

    area = 0.0
    for index in range(len(every_loss) - 1):
        loss = every_loss[index]
        width = every_loss[index + 1] - loss
        first_share = bisect_right(first_sorted, loss) / len(first_sorted)
        second_share = bisect_right(second_sorted, loss) / len(second_sorted)
        area += abs(first_share - second_share) * width
    return area


@dataclass(frozen=True)
class NextStep:
    """What the rule says once some temperatures are measured: one to measure next, or the one chosen."""

    measure: float | None
    chosen: float | None


# The search starts from the model's own estimate of how a player at its
# rating chooses, and moves along a grid of quarter steps.
STARTING_TEMPERATURE = 1
TEMPERATURE_STEP = 0.25


def next_step(distances: dict[float, float]) -> NextStep:
    """Applies the rule that chooses the temperature to the distances measured so far.

    distances maps each temperature measured to how far the Bot's losses at
    that temperature are from Camille's (loss_distance). The search starts
    at 1, the model's own estimate, and measures the temperatures a quarter
    step either side of the closest one so far, the lower first. A
    temperature is chosen once it is closer than both its neighbours, so the
    search carries on in whichever direction keeps getting closer and never
    stops at the edge of what it has measured. Temperature 0, the most likely
    move every time, has no lower neighbour.
    """
    if not distances:
        return NextStep(measure=STARTING_TEMPERATURE, chosen=None)

    def closeness(temperature: float) -> tuple[float, float, float]:
        # Closest losses first; on a tie, the temperature nearer the model's
        # own estimate, then the lower one, which strays less from the most
        # likely move.
        return (distances[temperature], abs(temperature - STARTING_TEMPERATURE), temperature)

    closest = min(distances, key=closeness)
    lower = closest - TEMPERATURE_STEP
    higher = closest + TEMPERATURE_STEP
    # Below 0 there is nothing to measure: 0 already plays the most likely
    # move every time.
    lower_exists = lower >= 0
    if lower_exists and lower not in distances:
        return NextStep(measure=lower, chosen=None)
    if higher not in distances:
        return NextStep(measure=higher, chosen=None)
    return NextStep(measure=None, chosen=closest)
