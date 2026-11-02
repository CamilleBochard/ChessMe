from pipeline.bot_data_release import next_release


def test_follows_the_highest_release_even_one_that_was_never_deployed():
    tags = ["bot-data-1", "bot-data-2", "bot-data-3", "bot-data-4"]

    assert next_release(tags) == "bot-data-5"


def test_ignores_releases_that_are_not_bot_data():
    tags = ["untrained-maia3-5m", "bot-data-3", "pipeline-state", "bot-data-old"]

    assert next_release(tags) == "bot-data-4"


def test_compares_release_numbers_as_numbers():
    tags = ["bot-data-9", "bot-data-10"]

    assert next_release(tags) == "bot-data-11"


def test_names_the_first_release_when_none_exists():
    assert next_release(["pipeline-state"]) == "bot-data-1"
