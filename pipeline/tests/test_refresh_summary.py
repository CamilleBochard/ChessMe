from pipeline.dataset import Position
from pipeline.refresh_summary import book_changes, new_games_summary, profile_movement


def position(game_id: str, ply: int, phase: str) -> Position:
    return Position(game_id=game_id, source="lichess", ply=ply, phase=phase, fen="a-fen", move="e2e4")


def test_counts_the_games_the_dataset_gained_and_their_moves_per_phase():
    before = [position("lichess:old", 1, "opening")]
    after = before + [position("lichess:new", 1, "opening"), position("lichess:new", 13, "middlegame"), position("lichess:other", 41, "endgame")]

    summary = new_games_summary(before, after)

    assert summary == {"games": 2, "moves": {"opening": 1, "middlegame": 1, "endgame": 1}}


def test_counts_the_opening_book_positions_added_dropped_and_answered_with_another_move():
    before = {"kept": "e2e4", "replied-otherwise": "d2d4", "gone": "c2c4"}
    after = {"kept": "e2e4", "replied-otherwise": "g1f3", "new": "b1c3", "also-new": "f2f4"}

    changes = book_changes(before, after)

    assert changes == {"positions_before": 3, "positions_after": 4, "added": 2, "dropped": 1, "changed": 1}


def blunder_profile(middlegame_mean: float) -> dict:
    phases = {phase: {"mean": None} for phase in ("opening", "middlegame", "endgame")}
    phases["middlegame"] = {"mean": middlegame_mean}
    return {"open_positions": {"phases": phases}}


def improbability_yardstick(share_at_one_percent: float, high: float) -> dict:
    # 51 rungs from 10^-5 to 1; the rung of 1% is the 31st.
    at_or_below = [0.0] * 30 + [share_at_one_percent] + [1.0] * 20
    phases = {phase: {"atOrBelow": at_or_below, "perGame": None} for phase in ("opening", "middlegame", "endgame")}
    phases["middlegame"]["perGame"] = {"games": 200, "low": 0, "high": high}
    return {"phases": phases}


def loss_yardstick(high: float) -> dict:
    phases = {phase: {"perGame": None} for phase in ("opening", "middlegame", "endgame")}
    phases["middlegame"]["perGame"] = {"games": 900, "low": 24, "high": high}
    return {"phases": phases}


def test_reads_how_far_each_profile_moved_per_phase():
    before = {"blunder_profile": blunder_profile(104.1), "improbability": improbability_yardstick(0.0106, 0.1), "loss": loss_yardstick(160)}
    after = {"blunder_profile": blunder_profile(101.5), "improbability": improbability_yardstick(0.0112, 0.11), "loss": loss_yardstick(158)}

    moved = profile_movement(before, after)

    assert moved["blunder_profile"]["middlegame mean loss, open positions"] == {"before": 104.1, "after": 101.5}
    assert moved["improbability"]["middlegame share at or below 1%"] == {"before": 0.0106, "after": 0.0112}
    assert moved["improbability"]["middlegame middle 80% of games, high"] == {"before": 0.1, "after": 0.11}
    assert moved["loss"]["middlegame middle 80% of games, high"] == {"before": 160, "after": 158}
    assert moved["loss"]["opening middle 80% of games, high"] == {"before": None, "after": None}


def test_reads_a_profile_built_for_the_first_time_as_having_nothing_before():
    moved = profile_movement({"blunder_profile": None}, {"blunder_profile": blunder_profile(101.5)})

    assert moved["blunder_profile"]["middlegame mean loss, open positions"] == {"before": None, "after": 101.5}
