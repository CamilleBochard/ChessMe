"""Checks the site in production after a deployment, as the monthly refresh does before keeping it.

Run from the repository root, against the production address:

    python -m pipeline.check_production https://<production host>

Four checks, each retried until it passes or five minutes have gone by,
since a container that has just restarted may need a moment:

- the page answers;
- the Base Model and the Opening Book it serves have the checksums of
  docker/bot-data.sha256, read from the manifest the build serves
  (public/bot-data.json), and the model downloaded from production hashes
  as the manifest says;
- the Session Games service answers /api/session-games/counts;
- a headless browser plays three moves against the Bot. It needs
  Playwright for Python (pip install playwright==1.63.0, then
  python -m playwright install --with-deps chromium); --chromium names a
  browser already installed instead. Anything the page would send to the
  Session Games service is blocked, so the check never records a game.

Exits with 1 and names every check that failed.
"""

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from pipeline.extract_blunder_profile import REPOSITORY_ROOT

PUBLISHED_CHECKSUMS = REPOSITORY_ROOT / "docker" / "bot-data.sha256"
RETRY_SECONDS = 5 * 60
SECONDS_BETWEEN_TRIES = 20


def parse_checksums(text: str) -> dict[str, str]:
    """The sha256 of each file a sha256sum listing names, by the file's path."""
    checksums = {}
    for line in text.splitlines():
        if line.strip() == "":
            continue
        digest, path = line.split(maxsplit=1)
        checksums[path.strip()] = digest
    return checksums


def bot_data_problems(served: dict, published: dict[str, str], served_model_sha256: str) -> list[str]:
    """Every way production's model and Opening Book differ from the published ones; none when they match.

    served is the manifest production serves, published the checksums the
    repository holds, served_model_sha256 the hash of the model as
    downloaded from production.
    """
    problems = []
    for path, digest in published.items():
        served_digest = served["sha256"].get(path)
        if served_digest != digest:
            problems.append(f"production serves {path} with sha256 {served_digest}, the published one is {digest}")
    claimed = None
    for path, digest in served["sha256"].items():
        if path.endswith(".onnx"):
            claimed = digest
    if served_model_sha256 != claimed:
        problems.append(f"the model at {served['modelUrl']} hashes as {served_model_sha256}, not as the manifest says ({claimed})")
    return problems


def run_checks(checks: dict[str, Callable[[], list[str]]], retry_seconds: float, between_tries: float, clock=time) -> dict[str, list[str]]:
    """Runs every check, trying again the ones that fail until they pass or retry_seconds have gone by.

    A check returns its problems, none when it passes; one that raises
    counts as failing with the error as its problem. Returns the checks still
    failing at the end, with their last problems.
    """
    deadline = clock.time() + retry_seconds
    failing = dict(checks)
    last_problems: dict[str, list[str]] = {}
    while True:
        for name, check in list(failing.items()):
            try:
                problems = check()
            except Exception as error:
                problems = [f"{type(error).__name__}: {error}"]
            if problems:
                last_problems[name] = problems
            else:
                del failing[name]
                last_problems.pop(name, None)
        if not failing or clock.time() >= deadline:
            return last_problems
        clock.sleep(between_tries)


def _get(url: str) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": "ChessMe production check"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, b""


def check_page(site: str) -> list[str]:
    status, body = _get(site + "/")
    if status != 200 or b"<html" not in body.lower():
        return [f"the page answered {status}"]
    return []


def check_bot_data(site: str, published_text: str) -> list[str]:
    status, body = _get(site + "/bot-data.json")
    if status != 200:
        return [f"/bot-data.json answered {status}"]
    served = json.loads(body)
    status, model = _get(site + served["modelUrl"])
    if status != 200:
        return [f"{served['modelUrl']} answered {status}"]
    return bot_data_problems(served, parse_checksums(published_text), hashlib.sha256(model).hexdigest())


def check_counts(site: str) -> list[str]:
    status, body = _get(site + "/api/session-games/counts")
    if status != 200:
        return [f"/api/session-games/counts answered {status}"]
    try:
        json.loads(body)
    except ValueError:
        return ["/api/session-games/counts did not answer JSON"]
    return []


# Legal whatever the Bot answers: no Black move in the first three can block
# or pin them, or give check.
THREE_MOVES = ["g1f3", "g2g3", "f1g2"]
# Each row of the move list holds a cell for White's move and one for
# Black's, the second empty, or White's an ellipsis, until that move is played.
PLAYED_MOVES = (
    "[...document.querySelectorAll('[data-move-list] .move')]"
    ".filter((cell) => !['', '…'].includes(cell.textContent.trim())).length"
)
# Long enough for a first visit to download the Base Model, about 20 MB.
BOT_REPLY_TIMEOUT_MS = 180_000


def check_playing(site: str, chromium: str | None = None) -> list[str]:
    """Plays three moves as White in a headless browser, each answered by the Bot."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=chromium)
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 900})

            # The check is not a visitor: nothing it does reaches the Session Games.
            def keep_out_of_the_session_games(route):
                if route.request.method == "POST":
                    route.abort()
                else:
                    route.continue_()

            page.route("**/api/session-games**", keep_out_of_the_session_games)
            page.goto(site + "/")
            page.click('[data-play-as="white"]', timeout=BOT_REPLY_TIMEOUT_MS)
            for number, move in enumerate(THREE_MOVES):
                _click_square(page, move[:2])
                _click_square(page, move[2:4])
                # The visitor's move and the Bot's reply.
                expected = 2 * (number + 1)
                page.wait_for_function(f"expected => ({PLAYED_MOVES}) >= expected", arg=expected, timeout=BOT_REPLY_TIMEOUT_MS)
            played = page.evaluate(PLAYED_MOVES)
        finally:
            browser.close()
    if played < 2 * len(THREE_MOVES):
        return [f"only {played} moves were played"]
    return []


def _click_square(page, square: str) -> None:
    """Clicks a square of the board seen from White's side, as chessground lays it out."""
    board = page.locator("cg-board").bounding_box()
    size = board["width"] / 8
    file = ord(square[0]) - ord("a")
    rank = int(square[1])
    x = board["x"] + (file + 0.5) * size
    y = board["y"] + (8 - rank + 0.5) * size
    page.mouse.click(x, y)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check the site in production after a deployment.")
    parser.add_argument("site", help="the production address, such as https://example.org")
    parser.add_argument("--chromium", help="a Chromium to run instead of Playwright's own")
    parser.add_argument("--retry-seconds", type=float, default=RETRY_SECONDS)
    parser.add_argument(
        "--fail-on-purpose",
        action="store_true",
        help="report a failure whatever production does, to exercise the rollback that follows",
    )
    arguments = parser.parse_args()
    site = arguments.site.rstrip("/")
    published = PUBLISHED_CHECKSUMS.read_text(encoding="utf-8")

    checks = {
        "the page answers": lambda: check_page(site),
        "the model and Opening Book are the published ones": lambda: check_bot_data(site, published),
        "the Session Games service answers": lambda: check_counts(site),
        "a browser plays three moves against the Bot": lambda: check_playing(site, arguments.chromium),
    }
    failed = run_checks(checks, retry_seconds=arguments.retry_seconds, between_tries=SECONDS_BETWEEN_TRIES)
    if arguments.fail_on_purpose:
        failed["failing on purpose"] = ["--fail-on-purpose was given, to exercise the rollback"]
    # Every check in order, then a failure that is no check's, so the log
    # says why the run failed even when every check passed.
    for name in list(checks) + [name for name in failed if name not in checks]:
        verdict = "FAILED" if name in failed else "passed"
        print(f"{verdict}: {name}")
        for problem in failed.get(name, []):
            print(f"    {problem}")
    if failed:
        sys.exit(1)
