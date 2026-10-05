import json
import threading
import urllib.error
import urllib.request

import pytest

from pipeline.serve_session_games import make_server
from pipeline.session_games import open_store, session_game_pgns

FOOLS_MATE = {
    "botColour": "black",
    "baseModel": "maia3-5m",
    "moves": [
        {"uci": "f2f3"},
        {"uci": "e7e5", "source": "opening-book"},
        {"uci": "g2g4"},
        {"uci": "d8h4", "source": "base-model"},
    ],
}


@pytest.fixture
def service(tmp_path):
    """The service running on a free local port, and the database it writes to."""
    database = tmp_path / "session-games.sqlite"
    server = make_server(database, host="127.0.0.1", port=0)
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


def test_answers_a_refused_game_with_the_reason(service):
    abandoned = {"botColour": "black", "baseModel": "maia3-5m", "moves": [{"uci": "e2e4"}]}

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
    oversized = {"botColour": "black", "baseModel": "maia3-5m", "moves": [{"uci": "e2e4"}] * 20_000}

    status, reply = post(service["url"] + "/api/session-games", oversized)

    assert status == 413
