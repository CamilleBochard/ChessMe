import json
import threading
import urllib.error
import urllib.request

import pytest

from pipeline.player_record import opening_table
from pipeline.serve_session_games import make_server
from pipeline.session_games import open_store, session_game_counts, session_game_pgns, visitor_ratings

FOOLS_MATE = {
    "botColour": "black",
    "baseModel": "maia3-5m",
    "rating": 1100,
    "moves": [
        {"uci": "f2f3"},
        {"uci": "e7e5", "source": "opening-book"},
        {"uci": "g2g4"},
        {"uci": "d8h4", "source": "base-model"},
    ],
}


# The openings the service names the Bot's games after: a table of one line is
# enough to see a game named.
OPENINGS = opening_table([("Barnes Opening", "1. f3")])


@pytest.fixture
def service(tmp_path):
    """The service running on a free local port, and the database it writes to."""
    database = tmp_path / "session-games.sqlite"
    server = make_server(database, OPENINGS, host="127.0.0.1", port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    host, port = server.server_address
    yield {"url": f"http://{host}:{port}", "database": database}

    server.shutdown()
    server.server_close()


def post(url, body):
    """Sends body as JSON and returns the status and the decoded reply, if any."""
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, read_json(response.read())
    except urllib.error.HTTPError as error:
        return error.code, read_json(error.read())


def get(url):
    """Fetches url and returns the status and the decoded reply."""
    try:
        with urllib.request.urlopen(url) as response:
            return response.status, read_json(response.read())
    except urllib.error.HTTPError as error:
        return error.code, read_json(error.read())


def read_json(raw):
    if raw == b"":
        return None
    return json.loads(raw)


def test_stores_a_finished_game_posted_to_it(service):
    status, reply = post(service["url"] + "/api/session-games", FOOLS_MATE)

    assert status == 201
    assert isinstance(reply["id"], str)
    pgns = session_game_pgns(open_store(service["database"]))
    assert len(pgns) == 1
    assert "1. f3 e5 2. g4 Qh4# 0-1" in pgns[0]


def test_answers_the_counts_of_the_stored_games(service):
    post(service["url"] + "/api/session-games", FOOLS_MATE)

    status, reply = get(service["url"] + "/api/session-games/counts")

    assert status == 200
    assert reply["games"] == 1
    assert reply["bot_wins"] == 1
    assert reply["bot_moves_from_opening_book"] == 1


def test_answers_the_bots_record_over_the_stored_games(service):
    post(service["url"] + "/api/session-games", FOOLS_MATE)

    status, reply = get(service["url"] + "/api/session-games/record")

    assert status == 200
    assert reply["games"] == 1
    assert reply["black"]["results"] == {"wins": 1, "draws": 0, "losses": 0}
    assert reply["black"]["openings"][0]["name"] == "Barnes Opening"


def test_answers_a_record_that_counts_a_game_stored_after_it_was_last_read(service):
    post(service["url"] + "/api/session-games", FOOLS_MATE)
    get(service["url"] + "/api/session-games/record")

    post(service["url"] + "/api/session-games", FOOLS_MATE)
    status, reply = get(service["url"] + "/api/session-games/record")

    assert reply["games"] == 2


def test_answers_a_refused_game_with_the_reason(service):
    abandoned = {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": [{"uci": "e2e4"}]}

    status, reply = post(service["url"] + "/api/session-games", abandoned)

    assert status == 400
    assert reply == {"error": "the game has not ended"}


def test_answers_a_body_that_is_not_json_as_a_bad_request(service):
    request = urllib.request.Request(service["url"] + "/api/session-games", data=b"{not json", method="POST")

    with pytest.raises(urllib.error.HTTPError) as refusal:
        urllib.request.urlopen(request)

    assert refusal.value.code == 400


def test_refuses_a_body_far_larger_than_any_game(service):
    # A long game of 300 moves reports in about 12 KB.
    oversized = {"botColour": "black", "baseModel": "maia3-5m", "rating": 1100, "moves": [{"uci": "e2e4"}] * 20_000}

    status, reply = post(service["url"] + "/api/session-games", oversized)

    assert status == 413


def test_records_the_visitors_impression_of_a_stored_game(service):
    _, stored = post(service["url"] + "/api/session-games", FOOLS_MATE)

    status, reply = post(
        service["url"] + f"/api/session-games/{stored['id']}/impression",
        {"feltLikeARealPlayer": True},
    )

    assert status == 204
    counts = session_game_counts(open_store(service["database"]))
    assert counts["felt_like_a_real_player"] == 1


def test_answers_an_impression_for_an_unknown_game_as_not_found(service):
    status, _ = post(
        service["url"] + "/api/session-games/00000000-0000-4000-8000-000000000000/impression",
        {"feltLikeARealPlayer": True},
    )

    assert status == 404


def test_answers_a_second_impression_for_a_game_as_a_conflict(service):
    _, stored = post(service["url"] + "/api/session-games", FOOLS_MATE)
    impression_url = service["url"] + f"/api/session-games/{stored['id']}/impression"
    post(impression_url, {"feltLikeARealPlayer": True})

    status, _ = post(impression_url, {"feltLikeARealPlayer": False})

    assert status == 409


@pytest.mark.parametrize("answer", [{}, {"feltLikeARealPlayer": "yes"}, {"feltLikeARealPlayer": 1}, ["yes"]])
def test_answers_an_impression_that_is_not_yes_or_no_as_a_bad_request(service, answer):
    _, stored = post(service["url"] + "/api/session-games", FOOLS_MATE)

    status, _ = post(service["url"] + f"/api/session-games/{stored['id']}/impression", answer)

    assert status == 400


def test_writes_no_visitor_address_to_its_output(service, capsys):
    _, stored = post(service["url"] + "/api/session-games", FOOLS_MATE)
    post(service["url"] + f"/api/session-games/{stored['id']}/impression", {"feltLikeARealPlayer": True})
    post(service["url"] + "/api/session-games", {"moves": "nonsense"})

    output = capsys.readouterr()

    assert "127.0.0.1" not in output.out
    assert "127.0.0.1" not in output.err


def test_records_the_ratings_a_visitor_gives_for_a_stored_game(service):
    _, stored = post(service["url"] + "/api/session-games", FOOLS_MATE)

    status, _ = post(service["url"] + f"/api/session-games/{stored['id']}/ratings", {"lichess": 1650, "chesscom": None})

    assert status == 204
    ratings = visitor_ratings(open_store(service["database"]))
    assert ratings == [{"game_id": stored["id"], "lichess": 1650, "chesscom": None}]


def test_answers_a_second_answer_with_ratings_as_a_conflict(service):
    _, stored = post(service["url"] + "/api/session-games", FOOLS_MATE)
    ratings_url = service["url"] + f"/api/session-games/{stored['id']}/ratings"
    post(ratings_url, {"lichess": 1650, "chesscom": None})

    status, _ = post(ratings_url, {"lichess": None, "chesscom": 1400})

    assert status == 409


@pytest.mark.parametrize("answer", [{"lichess": 20, "chesscom": None}, {}, [1500], "1500"])
def test_answers_ratings_that_cannot_be_recorded_as_a_bad_request(service, answer):
    _, stored = post(service["url"] + "/api/session-games", FOOLS_MATE)

    status, _ = post(service["url"] + f"/api/session-games/{stored['id']}/ratings", answer)

    assert status == 400


def test_answers_ratings_for_an_unknown_game_as_not_found(service):
    status, _ = post(
        service["url"] + "/api/session-games/00000000-0000-4000-8000-000000000000/ratings",
        {"lichess": 1500, "chesscom": None},
    )

    assert status == 404
