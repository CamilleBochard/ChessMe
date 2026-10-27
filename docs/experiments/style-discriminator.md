# The style discriminator

The Style Fingerprint compares Camille and the Bot through averages over
hundreds of games. The style discriminator asks the question one game at a
time: given a single game, how likely is it that Camille played it rather
than another player at his Level? A classifier is trained to answer it on
his games and on a sample of other players', checked on games of his it never
saw, and only then asked about the Bot's games and the Baseline's.

The idea comes from behavioural stylometry: McIlroy-Young et al., *Detecting
Individual Decision-Making Style: Exploring Behavioral Stylometry in Chess*
(NeurIPS 2021), identified players from their games with a network trained
on far more games than this project has. This experiment has about a
thousand of Camille's, so it uses a much simpler model and expects a much
weaker signal.

## Reproducing

```sh
python -m pipeline.fetch_other_players
npm run bot-games -- --model models/onnx/maia3-5m.onnx
npm run bot-games -- --model models/onnx/maia3-5m.onnx --baseline --out data/dataset/baseline-games.jsonl
npm run bot-games -- --temperature 1 --opening-cut top-k=10 --opponent-rating 1100 --out data/dataset/bot-games-served.jsonl
npm run bot-games -- --model models/onnx/maia3-5m-fine-tuned.onnx --temperature 1 --opponent-rating 1100 --out data/dataset/bot-games-fine-tuned-at-1.jsonl
python -m pipeline.measure_style_discriminator
```

The first command samples the other players from the Lichess database (it
needs `curl` and `zstd`, and takes about two minutes). The next four play
400 games each under Node: the Bot's and the Baseline's, about fifteen
minutes each, then the Bot as the site serves it, with and without its
opening cut, about five minutes each on a desktop. The last trains the
discriminator, scores every group of games and writes
`docs/experiments/results/style-discriminator.json`, with the tables below
on standard output. No Stockfish analysis is needed.

The same run writes what the site needs to score a game at the end of each
Session Game: `src/explanation/style-discriminator.json` holds the
discriminator's parameters, the scores of Camille's Test Set and of the other
players' test split, and the separations below;
`src/explanation/style-discriminator-parity.json` holds twelve of his Test
Set games with their scores, which the page's own scoring is tested against.

## The other players

Lichess publishes every rated game of each month as one compressed PGN file
at [database.lichess.org](https://database.lichess.org), in the public
domain. The sample is read from the start of the September 2026 file
(`lichess_db_standard_rated_2026-09.pgn.zst`), which is streamed and never
downloaded whole: the download stops once the sample is full. A month's file
never changes once published, so the sample can be drawn again exactly.

A game enters the sample when it is a 10-minute game, as Camille's are, and
one of its players is rated 1190 to 1360: the middle 80% of Camille's own
Lichess ratings in the dataset's games (10th percentile 1191, median 1261,
90th percentile 1361). Only that player's side is kept, and each player
enters once, so the sample is 3,000 different players rather than a few
prolific ones; 2,989 of the games hold at least one move of the sampled
player. Camille's own account is left out. When both players of a
game qualify, a hash of the game's id picks one, so the sample is not
filled with White's games.

The other players are split into training games and a test split by the
same rule as Camille's Test Set: a hash of the game's id, 20% kept out of
training.

## What the discriminator reads

Each game is read as the Style Fingerprint's move statistics, computed on that
game alone, from ply 11 on:

- the share of the player's moves made by each piece type, in the middlegame
  and in the endgame;
- the share of positions with a capture on offer in which the player took
  one, in the middlegame and in the endgame;
- whether the player castled kingside, castled queenside, and whether both
  queens were off the board before move 20.

**From ply 11 on.** The Opening Book plays almost only in the opening Phase:
in the Bot's 400 games, 946 of its 2,000 moves in the first ten plies came
from the book, and 9 of its 14,316 later moves. A discriminator that read the
opening would find Camille's repertoire in the Bot's games because the book
replays it, which [the Opening Book's measurement](opening-book.md) already
shows. The question here is how the Bot plays once the book is behind it. The
cost is small: 699 of Camille's 719 castles come after ply 10.

**No centipawn loss.** The other players are chosen at Camille's Level, so
Level is held equal and what is left to tell him apart is Style. The Bot's
Level is already known to be far from his ([the Style
Fingerprint](style-fingerprint.md)); a discriminator reading it would mostly
report that again.

**Games long enough to read.** A game with fewer than ten of the player's
moves from ply 11 on is left out: its shares and rates rest on too few moves.
The rule keeps 87% of Camille's games, 85% of the other players' and 395 of
the Bot's 400.

## The classifier

A logistic regression from scikit-learn. Each statistic is rescaled to a mean
of 0 and a standard deviation of 1 and given a weight; the weighted sum is
turned into a probability between 0 and 1, the game's score. A statistic a
game gives no evidence on, such as the endgame of a game that ends before it,
is taken at the average game's value. The two classes are weighted equally,
however many games each holds.

A linear model on seventeen statistics is the deliberate choice for about a
thousand games: a larger model would have more room to memorise its training
games than to learn a style, and the weights of this one can be read.

## How the figures are measured

**Area under the curve.** The probability that a game drawn from one group
scores higher than a game drawn from another. It is 0.5 when the
discriminator cannot tell the groups apart and 1 when it never ranks them the
wrong way round. It does not depend on where the scores sit, only on their
order.

**Intervals.** Every figure carries a 95% bootstrap interval: the games of
each group are drawn again at random, with replacement, as many as there
were, the figure is computed again, 2,000 times, and the middle 95% of the
results is the interval. It shows how far the figure would move with another
sample of games scored by the same trained discriminator. It leaves out how
far the discriminator itself would change if trained on other games, so the
true uncertainty is somewhat wider. The draws are seeded.

**Bot against Baseline.** Both sets of games were played by the same script
against the same opponent with the same seed; the only difference is the
Opening Book. Neither is a human game: no clock, nobody resigns, and the
opponent is a model. The discriminator never saw such games in training, so
their raw scores are read with caution, but the oddity is shared, and the
difference between the two is the comparison the experiment reports.

As a check of the measurement itself, the Bot's games passed as both groups
give an area of exactly 0.5 and a difference of exactly 0, with intervals of
0.46 to 0.54 and -0.014 to +0.013: the spread two groups of 395 identical
games show by chance.

## Results

Measured on 2026-10-08, and again on 2026-10-27 with the Bot as served
added: trained again on the same games, the discriminator gives every
earlier figure exactly. It was trained on 702 of Camille's training games
and 2,010 of the other players'. The Bot's and the Baseline's games were
played against the Base Model at 2000, seed 13; the Bot scored 175 wins, 82
draws and 143 losses, the Baseline 179, 66 and 155. The Bot as served, and
the same without its opening cut, played the Base Model at 1100, seed 13
(see [the Bot as served](#the-bot-as-served)).

A game's score is the probability, by the discriminator, that Camille played
it. "Scored as Camille" is the share of games whose score is above one half.

| Games | Scored | Mean score (95% interval) | Scored as Camille |
|---|---|---|---|
| Camille, Test Set | 207 | 0.506 (0.493 to 0.520) | 55.1% |
| Other players, test split | 522 | 0.480 (0.471 to 0.488) | 43.1% |
| Bot | 395 | 0.487 (0.477 to 0.496) | 46.8% |
| Baseline | 378 | 0.485 (0.475 to 0.493) | 47.4% |
| Bot as served | 387 | 0.493 (0.484 to 0.503) | 50.4% |
| Bot as served, without the opening cut | 384 | 0.509 (0.500 to 0.518) | 53.4% |
| Camille, training games | 702 | 0.517 (0.511 to 0.524) | 59.3% |
| Other players, training games | 2,010 | 0.483 (0.479 to 0.487) | 43.7% |

| Separation | Area under the curve (95% interval) |
|---|---|
| Camille's Test Set against the other players' test split | 0.573 (0.527 to 0.620) |
| Camille's Lichess Test Set games against the other players' test split | 0.537 (0.473 to 0.599) |
| Camille's Chess.com Test Set games against the other players' test split | 0.601 (0.540 to 0.660) |
| Training games, for comparison | 0.610 (0.586 to 0.634) |
| Bot against the other players' test split | 0.519 (0.483 to 0.559) |
| Baseline against the other players' test split | 0.514 (0.476 to 0.550) |
| Bot against Baseline | 0.505 (0.465 to 0.543) |
| Bot as served against the other players' test split | 0.538 (0.502 to 0.578) |
| Bot as served without the opening cut, against the other players' test split | 0.579 (0.544 to 0.615) |
| Bot as served against the same without the opening cut | 0.459 (0.418 to 0.498) |

The Bot's mean score minus the Baseline's: +0.002 (-0.010 to +0.015). The
served Bot's minus the same without the opening cut: -0.015 (-0.029 to
-0.003).

The weights, strongest first. A positive weight pushes a game towards
Camille, and the size is the push of one standard deviation of the statistic.

| Statistic | Weight |
|---|---|
| capture taken when on offer, middlegame | -0.17 |
| king moves, endgame | -0.16 |
| bishop moves, endgame | +0.13 |
| bishop moves, middlegame | +0.11 |
| king moves, middlegame | -0.10 |
| rook moves, middlegame | +0.08 |
| knight moves, endgame | -0.08 |
| rook moves, endgame | +0.08 |
| pawn moves, endgame | +0.07 |
| pawn moves, middlegame | -0.07 |
| queen moves, middlegame | -0.06 |
| castled queenside | +0.06 |
| knight moves, middlegame | +0.04 |
| castled kingside | -0.03 |
| queen moves, endgame | -0.03 |
| capture taken when on offer, endgame | -0.01 |
| queens off before move 20 | +0.01 |

## What the discriminator can tell

**A signal exists, and it is weak.** On games it never saw, the
discriminator ranks one of Camille's games above another player's 57 times in
100, where a coin would manage 50; the interval, 0.527 to 0.620, stays clear of
0.5. It is far from recognising him: it scores 55% of his Test Set games as
his, and 43% of the other players' as his too. Its separation on its own
training games is barely higher (0.610), so the limit is not a model that
memorised its games: these statistics, read from one game of a few dozen
moves, carry little of what sets Camille apart. Whether that little is his
Style at all is the next question.

**Part of it may be the site.** Every other player comes from Lichess, while
most of Camille's games come from Chess.com. On his Chess.com games the
separation is 0.601; on his 89 Lichess games, the like-for-like comparison,
it is 0.537 and its interval includes 0.5. The two intervals overlap widely,
so the gap may be chance on a small sample, but the data cannot rule out that
some of what the discriminator learnt is how games go on Chess.com rather
than how Camille plays. The figure that compares like with like does not
clear chance.

**What sets him apart from his peers is not what sets him apart from the
Bot.** The weights that matter most say he takes an offered capture less
often in the middlegame, moves his king less in the endgame and his bishops
more. Castling, the clearest difference between him and the Bot in the Style
Fingerprint, barely separates him from other players (+0.06 for castling
queenside), because they castle as he does. Over every game of each group,
measured by the fingerprint's own code:

| Castling, whole game | Camille | Other players | Bot | Baseline |
|---|---|---|---|---|
| Kingside | 53.5% | 56.3% | 84.0% | 82.8% |
| Queenside | 15.2% | 12.7% | 6.5% | 6.0% |
| Never | 31.3% | 30.9% | 9.5% | 11.3% |

The Bot's castling is not Camille's and not his peers' either: it belongs to
the Base Model's top move. The discriminator cannot see it, and this is a
limit of the instrument rather than a finding about the Bot. Trained to tell
Camille from other people, it weighs only what differs between them, and a
Bot can be unlike everyone in a way that no weight measures.

## The Bot against the Baseline: no difference found

The Bot's games score 0.002 higher than the Baseline's on average, with an
interval of -0.010 to +0.015, and a Bot game outranks a Baseline game 50.5
times in 100. The discriminator finds no trace of the Opening Book in how the
Bot plays after it. This was the expected outcome, stated before the
measurement: past ply 10 the Bot and the Baseline are the same model playing
its top move, and the book can only change the positions the middlegame
starts from. The interval bounds what was missed: the book raises the Bot's
mean score by at most 0.015, about half the gap of 0.026 between Camille's own
Test Set games and the other players'.

## The Bot against Camille's peers

Measured as Camille's Test Set is, the Bot stands out from the other players
at 0.519 and the Baseline at 0.514, and both intervals include 0.5: the
discriminator cannot tell the Bot's games from those of other players at
Camille's level. That does not make them unlike his. The Bot's interval
reaches 0.559 and Camille's starts at 0.527, so the data does not show that
the Bot is less like him than his own games are; and the Bot's games, with no
clock and a model across the board, are not the kind of game the
discriminator learnt from.

## The Bot as served

The Bot above is the one this experiment started with: the original model
playing its top move. The site now serves another: the fine-tuned model,
drawn at temperature 1, with the opening cut top-10 on plies 1 to 10 and the
Opening Book in front ([choosing the model on open
positions](model-choice-on-open-positions.md)). It played 400 games against
the Base Model at 1100, seed 13, and scored 186 wins, 65 draws and 149
losses; 387 are long enough to read. It is set beside the same Bot without
the cut, whose 400 games that experiment played against the same opponent
with the same seed (205 wins, 54 draws, 141 losses; 384 read). The opponent
is 1100 rather than the 2000 of the first Bot so that the cut is the only
difference between the two; against 2000, ten trial games of the served Bot
gave nine losses, and a Bot that is losing captures, trades and lasts
differently from one that is not.

**Without the cut, the Bot stands out from the other players as Camille
does:** 0.579 (0.544 to 0.615), against his own 0.573 (0.527 to 0.620).
**With the cut, as served, it stands out less:** 0.538 (0.502 to 0.578),
an interval that barely clears 0.5. Set against each other, the served Bot's
games score 0.015 lower on average, with an interval of -0.029 to -0.003,
and one of its games outranks one of the uncut Bot's 46 times in 100.

**The cut moved the Bot away from Camille past the opening, by a little,
and the evidence for it is thin.** The interval clears zero by 0.003, it
counts only the chance in which games were played, not the one seed both
runs share or the training of the discriminator, and it is one of several
comparisons this write-up reports. The cut changes no move after ply 10,
which is all the discriminator reads, so anything it changes there comes
through the positions the middlegame starts from; which of them, this run
does not show. The cut was served on a narrow pass, a share of improbable
opening moves closer to Camille's by less than his own uncertainty; this
measurement points the other way by about as little. A second seed for both
runs is what would separate a cost from chance.

**What the served Bot is, read one game at a time:** a player the
discriminator scores as Camille's in 50% of its games, between his 55% and
his peers' 43%. That is where a single game of it lands in the report, among
two groups that overlap almost entirely.

## The answer, stated plainly

This is a null result. The discriminator is the strongest test of the Bot's
Style this project can build on about a thousand of Camille's games, and it
is too weak an instrument for the question: it finds a small style signal in
his games, smaller still on the games that compare like with like, and
neither the Bot nor the Baseline carries that signal in a way it can measure.
It does not show that the Bot plays unlike Camille. It shows that, read
through these statistics and with this many games, Camille differs from
other players at his level by too little to judge an imitation by.

A stronger test would need more of his games, a comparison that does not
mix sites (his 403 Lichess games against Lichess players alone), or a model
that reads every move rather than a game's averages, as the published work
does; that last one needs far more games than he has played.
