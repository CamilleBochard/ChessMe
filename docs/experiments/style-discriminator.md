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
npm run bot-games
npm run bot-games -- --baseline --out data/dataset/baseline-games.jsonl
python -m pipeline.measure_style_discriminator
```

The first command samples the other players from the Lichess database (it
needs `curl` and `zstd`, and takes about two minutes). The next two play the
Bot's 400 games and the Baseline's 400 under Node, about fifteen minutes
each. The last trains the discriminator, scores every group of games and
writes `docs/experiments/results/style-discriminator.json`, with the tables
below on standard output. No Stockfish analysis is needed.

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

The other players are split into training games and held-out games by the
same rule as Camille's Test Set: a hash of the game's id, 20% held out.

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

Measured on 2026-10-08. The discriminator was trained on 702 of Camille's
training games and 2,010 of the other players'. The Bot's and the
Baseline's games were played against the Base Model at 2000, seed 13; the
Bot scored 175 wins, 82 draws and 143 losses, the Baseline 179, 66 and 155.

A game's score is the probability, by the discriminator, that Camille played
it. "Scored as Camille" is the share of games whose score is above one half.

| Games | Scored | Mean score (95% interval) | Scored as Camille |
|---|---|---|---|
| Camille, Test Set | 207 | 0.506 (0.493 to 0.520) | 55.1% |
| Other players, held out | 522 | 0.480 (0.471 to 0.488) | 43.1% |
| Bot | 395 | 0.487 (0.477 to 0.496) | 46.8% |
| Baseline | 378 | 0.485 (0.475 to 0.493) | 47.4% |
| Camille, training games | 702 | 0.517 (0.511 to 0.524) | 59.3% |
| Other players, training games | 2,010 | 0.483 (0.479 to 0.487) | 43.7% |

| Separation | Area under the curve (95% interval) |
|---|---|
| Camille's Test Set against held-out players | 0.573 (0.527 to 0.620) |
| Camille's Lichess Test Set games against held-out players | 0.537 (0.473 to 0.599) |
| Camille's Chess.com Test Set games against held-out players | 0.601 (0.540 to 0.660) |
| Training games, for comparison | 0.610 (0.586 to 0.634) |
| Bot against held-out players | 0.519 (0.483 to 0.559) |
| Baseline against held-out players | 0.514 (0.476 to 0.550) |
| Bot against Baseline | 0.505 (0.465 to 0.543) |

The Bot's mean score minus the Baseline's: +0.002 (-0.010 to +0.015).

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
0.5. It is far from recognising him: it scores 55% of his held-out games as
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
held-out games and the other players'.

## The Bot against Camille's peers

Measured as Camille's Test Set is, the Bot stands out from the other players
at 0.519 and the Baseline at 0.514, and both intervals include 0.5: the
discriminator cannot tell the Bot's games from those of other players at
Camille's level. That does not make them unlike his. The Bot's interval
reaches 0.559 and Camille's starts at 0.527, so the data does not show that
the Bot is less like him than his own games are; and the Bot's games, with no
clock and a model across the board, are not the kind of game the
discriminator learnt from.

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
