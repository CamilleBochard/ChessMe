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
        # game's, so that it pushes the answer neither way.
        SimpleImputer(strategy="mean"),
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
