"""The style discriminator: a classifier that tells Camille's games from other players'.

The Style Fingerprint compares Camille and the Bot through averages over
hundreds of games. The discriminator asks the question game by game: given
one game, how likely is it that Camille played it rather than another player
of his strength? Trained on his games and on a sample of other players', and
checked on games of his it never saw, it can then be asked about the Bot's.

It reads each game as the Style Fingerprint's move statistics computed on
that game alone, from ply 11 on: the first ten plies are where the Opening
Book plays, and the question is how the Bot plays where it has no book.
Centipawn loss is left out. The other players are chosen at Camille's
strength, so Level is what is held equal and Style is what is left to tell
him apart.

The classifier is a logistic regression: each statistic gets a weight, the
weighted sum becomes a probability, and the weights can be read back to see
which habits give Camille away.
"""

from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import StandardScaler

from pipeline.dataset import Position
from pipeline.style_fingerprint import PIECE_NAMES, move_statistics

# The Opening Book plays almost only in the first ten plies, the opening
# Phase; the discriminator reads from the middlegame on.
FIRST_PLY_READ = 11

# Fewer moves than this from ply 11 on and a game is too short to read. Ten
# keeps 87% of Camille's games, 85% of the other players' and 395 of the
# Bot's 400.
MIN_MOVES_READ = 10

# The Phases the discriminator reads.
PHASES_READ = ["middlegame", "endgame"]


def feature_names() -> list[str]:
    """The statistics a game is read as, in the order the classifier receives them."""
    names = []
    for phase in PHASES_READ:
        for piece in PIECE_NAMES.values():
            names.append(f"{piece} moves, {phase}")
        names.append(f"capture taken when on offer, {phase}")
    names.append("castled kingside")
    names.append("castled queenside")
    names.append("queens off before move 20")
    return names


def game_features(positions: list[Position]) -> dict[str, float | None]:
    """One game, read as the statistics the classifier receives.

    A statistic the game gives no evidence on, such as the endgame of a game
    that never reached it, is None.
    """
    positions_read = [position for position in positions if position.ply >= FIRST_PLY_READ]
    statistics = move_statistics(positions_read)

    features = {}
    for phase in PHASES_READ:
        piece_share = statistics["piece_share"]["phases"][phase]
        for piece in PIECE_NAMES.values():
            features[f"{piece} moves, {phase}"] = piece_share[piece]
        capture_rate = statistics["capture_taken_rate"]["phases"][phase]["rate"]
        features[f"capture taken when on offer, {phase}"] = capture_rate
    features["castled kingside"] = statistics["castling"]["kingside"]
    features["castled queenside"] = statistics["castling"]["queenside"]
    features["queens off before move 20"] = statistics["queen_trade_before_move_20"]["rate"]
    return features


class StyleDiscriminator:
    """A trained discriminator: one game in, the probability that Camille played it out."""

    def __init__(self, model: Pipeline):
        self._model = model

    def camille_probability(self, positions: list[Position]) -> float:
        row = _feature_row(positions)
        probabilities = self._model.predict_proba([row])[0]
        # Camille's games were labelled 1, so his probability is the second column.
        return float(probabilities[1])

    def weights(self) -> dict[str, float]:
        """How strongly each statistic pushes a game towards Camille (positive) or away from him (negative).

        Statistics are rescaled before they are weighed, so a weight is the
        push of one standard deviation and the weights compare with one
        another.
        """
        regression = self._model[-1]
        coefficients = regression.coef_[0]
        weights = {}
        for name, coefficient in zip(feature_names(), coefficients, strict=True):
            weights[name] = float(coefficient)
        return weights


def train_discriminator(camille_games: list[list[Position]], other_games: list[list[Position]]) -> StyleDiscriminator:
    """Trains the discriminator on Camille's games against other players' games, one list of positions per game."""
    rows = []
    labels = []
    for game in camille_games:
        rows.append(_feature_row(game))
        labels.append(1)
    for game in other_games:
        rows.append(_feature_row(game))
        labels.append(0)

    model = make_pipeline(
        # A statistic a game gives no evidence on is taken as the average
        # game's, so that it pushes the answer neither way. One that no game
        # gives evidence on is kept, as a column of zeros, so that every
        # weight stays on the statistic it is named after.
        SimpleImputer(strategy="mean", keep_empty_features=True),
        # Every statistic on the same scale, so that their weights compare.
        StandardScaler(),
        # The two classes weigh the same however many games each holds, so
        # that a larger sample of other players does not lean every answer
        # towards them.
        LogisticRegression(class_weight="balanced"),
    )
    model.fit(rows, labels)
    return StyleDiscriminator(model)


def _feature_row(positions: list[Position]) -> list[float]:
    features = game_features(positions)
    row = []
    for name in feature_names():
        value = features[name]
        if value is None:
            # The imputer recognises a missing value as NaN.
            value = float("nan")
        row.append(value)
    return row


def games_long_enough(positions: list[Position]) -> list[list[Position]]:
    """The positions grouped by game, keeping the games with enough moves from ply 11 on to be read.

    A game resigned soon after the opening leaves a handful of moves, too
    few for shares and rates to say anything; it is left out rather than
    scored on noise. The same rule applies to every player's games.
    """
    positions_by_game: dict[str, list[Position]] = {}
    for position in positions:
        positions_by_game.setdefault(position.game_id, []).append(position)

    games = []
    for game in positions_by_game.values():
        moves_read = [position for position in game if position.ply >= FIRST_PLY_READ]
        if len(moves_read) >= MIN_MOVES_READ:
            games.append(game)
    return games
