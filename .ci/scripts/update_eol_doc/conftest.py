import pytest
import argparse


@pytest.fixture
def args_fixture():
    parser = argparse.ArgumentParser()
    parser.add_argument("--release",
                        help="Release argument (PYTEST FIXTURE)",
                        required=True)
    parser.add_argument("--doc",
                        help="Doc argument (PYTEST FIXTURE)",
                        required=False)
    parser.release = "9.9.9"
    parser.doc = ".ci/scripts/update_eol_doc/tests/fixtures/upgrading.asciidoc"
    parser.quiet = True

    return parser
