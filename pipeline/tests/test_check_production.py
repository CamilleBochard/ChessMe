from pipeline.check_production import bot_data_problems, parse_checksums, run_checks

PUBLISHED = """ec63  models/onnx/maia3-5m-fine-tuned.onnx
5c14  data/dataset/opening-book.json
"""


def served(model: str, book: str) -> dict:
    return {
        "modelUrl": "/models/maia3-5m-fine-tuned-ec63.onnx",
        "sha256": {"models/onnx/maia3-5m-fine-tuned.onnx": model, "data/dataset/opening-book.json": book},
    }


def test_finds_nothing_wrong_when_production_serves_the_published_files():
    problems = bot_data_problems(served("ec63", "5c14"), parse_checksums(PUBLISHED), served_model_sha256="ec63")

    assert problems == []


def test_names_a_file_production_serves_another_version_of_and_a_model_that_does_not_hash_as_it_says():
    problems = bot_data_problems(served("ec63", "17cb"), parse_checksums(PUBLISHED), served_model_sha256="0000")

    assert len(problems) == 2
    assert "data/dataset/opening-book.json" in problems[0]
    assert "/models/maia3-5m-fine-tuned-ec63.onnx" in problems[1]


class Clock:
    """Stands in for time: sleeping moves it on at once."""

    def __init__(self):
        self.now = 0.0

    def time(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


def test_retries_each_check_until_it_passes_and_names_those_still_failing_when_time_runs_out():
    clock = Clock()
    answers = {"page": iter([["no answer"], ["no answer"], []])}

    def page() -> list[str]:
        return next(answers["page"])

    def counts() -> list[str]:
        return ["503 from /api/session-games/counts"]

    failed = run_checks({"page": page, "counts": counts}, retry_seconds=300, between_tries=20, clock=clock)

    assert failed == {"counts": ["503 from /api/session-games/counts"]}
    assert clock.now >= 300
