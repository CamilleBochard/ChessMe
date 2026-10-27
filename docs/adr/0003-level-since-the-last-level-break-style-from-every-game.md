# Level from the games since the last Level Break, Style from every game

Camille's play changes as he improves, and the Bot imitates him as he plays
today. Two things change at different speeds. His Level, how often and how
badly he goes wrong, can move within a few months. His Style, his
repertoire and the moves he prefers among reasonable ones, moves slowly, and
it is learned better from more games: the fine-tuned model and the Opening
Book are limited by how many games he has played, not by how old they are.

So each is described from the games that suit it. The dataset, fine-tuning,
the Opening Book and Move-Matching keep every game kept. The yardsticks of
Level, the Blunder Profile, the improbability profile and the per-game
spreads the report compares against, are built from the games played since
the last Level Break, and the Maia-Equivalent Rating is measured on them.
When no Level Break is found, they use every game, as before.

## Why not a window or weights by age

The usual ways to follow a player as he is today are to keep only the last N
months, or to weigh each game less the older it is. Both throw away or
discount Style data to follow a change in Level, which is the wrong trade
for a project limited by the number of games. Both also need a length, N
months or a half-life, chosen by hand, and a length chosen by hand drifts
towards whatever makes the figures look right.

A Level Break is found in the games by a rule fixed in advance: games in the
order they were played, the split where his mistake rate changes most, kept
only if no split of the same games shuffled at random changes it as much,
at the 1% level. It is stated and committed before it is first run
([the Level Break](../experiments/level-break.md)). When his Level has not
moved by more than chance, nothing is discarded.

## Consequences

Each position carries when its game was played, so any measure can be
built from the games since a given moment.

The rule runs again whenever new games arrive, which gives it a chance of a
false alarm every time: this is why it uses 1% rather than 5%, and why a
break needs at least 150 training games on each side.

The first day the dataset keeps, June 2025, was set by eye before this rule
existed. It stays as it is; whether the earlier games can come back for
Style once each game carries its rating is a separate decision.
